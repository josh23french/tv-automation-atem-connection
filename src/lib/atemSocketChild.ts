import { createSocket, Socket } from 'dgram'
import { EventEmitter } from 'events'
import { format } from 'util'
import { Util } from './atemUtil'
import { ConnectionState, IPCMessageType, PacketFlag } from '../enums'
import * as NanoTimer from 'nanotimer'

const IN_FLIGHT_TIMEOUT = 30 // ms
const RECONNECT_INTERVAL = 5000 // ms
const MAX_PACKET_RETRIES = 5
const MAX_PACKET_ID = (1 << 15) - 1 // Atem expects 15 not 16 bits before wrapping

export class AtemSocketChild extends EventEmitter {
	private readonly _debug = false

	private _connectionState = ConnectionState.Closed
	private _reconnectTimer: NodeJS.Timer | undefined
	private _retransmitTimer: NodeJS.Timer | undefined

	private _localPacketId = 1
	private _sessionId: number = 0

	private _address: string
	private _port: number = 9910
	private _socket: Socket

	private _lastReceivedAt: number = Date.now()
	private _lastReceivedPacketId = 0
	private _inFlight: Array<{packetId: number, trackingId: number, lastSent: number, packet: Buffer, resent: number}> = []
	private _ackTimer = new NanoTimer()
	private _hasTimeout = false
	private _receivedWithoutAck = 0
	private _lastAcked = 0

	constructor (options: { address?: string, port?: number } = {}) {
		super()
		this._address = options.address || ''
		this._port = options.port || this._port
		this._socket = this._createSocket()
	}

	public connect (address?: string, port?: number): void {
		if (!this._reconnectTimer) {
			this._reconnectTimer = setInterval(() => {
				if (this._lastReceivedAt + RECONNECT_INTERVAL > Date.now()) return
				if (this._connectionState === ConnectionState.Established) {
					this._connectionState = ConnectionState.Closed
					this.emit(IPCMessageType.Disconnect, null, null)
				}
				this._localPacketId = 1
				this._sessionId = 0
				this.log('reconnect')
				if (this._address && this._port) {
					this._sendPacket(Util.COMMAND_CONNECT_HELLO)
					this._connectionState = ConnectionState.SynSent
				}
			}, RECONNECT_INTERVAL)
		}
		// Check for retransmits every 10 milliseconds
		if (!this._retransmitTimer) {
			this._retransmitTimer = setInterval(() => this._checkForRetransmit(), 10)
		}

		if (address) {
			this._address = address
		}
		if (port) {
			this._port = port
		}

		this._sendPacket(Util.COMMAND_CONNECT_HELLO)
		this._connectionState = ConnectionState.SynSent
	}

	public disconnect (): Promise<void> {
		// Stop timers, as they just cause pointless work now.
		if (this._retransmitTimer) {
			clearInterval(this._retransmitTimer)
			this._retransmitTimer = undefined
		}
		if (this._reconnectTimer) {
			clearInterval(this._reconnectTimer)
			this._reconnectTimer = undefined
		}

		return new Promise((resolve) => {
			if (this._connectionState === ConnectionState.Established) {
				this._socket.close(() => {
					resolve()
				})
			} else {
				resolve()
			}
		}).then(() => {
			this._connectionState = ConnectionState.Closed
			this._createSocket()
			this.emit(IPCMessageType.Disconnect)
		})
	}

	public log (fmt: string, ...args: any[]): void {
		const payload = format(fmt, ...args)
		this.emit(IPCMessageType.Log, payload)
	}

	get nextPacketId (): number {
		return this._localPacketId
	}

	public _sendCommand (serializedCommand: Buffer, trackingId: number) {
		const payload = serializedCommand
		if (this._debug) this.log('PAYLOAD', payload)
		const buffer = Buffer.alloc(12 + payload.length, 0)
		buffer.writeUInt16BE(0x0800 | payload.length + 12, 0) // Opcode & Length
		buffer.writeUInt16BE(this._sessionId, 2)
		buffer.writeUInt16BE(this._localPacketId, 10)

		payload.copy(buffer, 12)
		this._sendPacket(buffer)

		this._inFlight.push({
			packetId: this._localPacketId,
			trackingId,
			lastSent: Date.now(),
			packet: buffer,
			resent: 0 })
		this._localPacketId++
		if (MAX_PACKET_ID < this._localPacketId) this._localPacketId = 0
	}

	private _createSocket () {
		this._socket = createSocket('udp4')
		this._socket.bind()
		this._socket.on('message', (packet, rinfo) => this._receivePacket(packet, rinfo))

		return this._socket
	}

	private _receivePacket (packet: Buffer, rinfo: any) {
		if (this._debug) this.log('RECV ', packet)
		this._lastReceivedAt = Date.now()
		const length = packet.readUInt16BE(0) & 0x07ff
		if (length !== rinfo.size) return

		const flags = packet.readUInt8(0) >> 3
		this._sessionId = packet.readUInt16BE(2)
		const remotePacketId = packet.readUInt16BE(10)

		// Send hello answer packet when receive connect flags
		if ((flags & PacketFlag.Connect) && !(flags & PacketFlag.IsRetransmit)) {
			this._sendPacket(Util.COMMAND_CONNECT_HELLO_ANSWER)
		}

		// Device asked for retransmit
		if (flags & PacketFlag.RetransmitRequest) {
			const fromPacketId = packet.readUInt16BE(6)
			this.log('Retransmit request: ', fromPacketId)

			// TODO
		}

		// Parse commands, Emit 'stateChanged' event after parse
		if (flags & PacketFlag.AckRequest) {
			if (this._connectionState === ConnectionState.Established) {
				if (remotePacketId === (this._lastReceivedPacketId + 1) % MAX_PACKET_ID) {
					this._attemptAck(remotePacketId)
					this._lastReceivedPacketId = remotePacketId
				} else {
					return
				}
			}
			if (length > 12) {
				this.emit(IPCMessageType.InboundCommand, packet.slice(12), remotePacketId)
			}
		}

		// Send ping packet, Emit 'connect' event after receive all stats
		if (flags & PacketFlag.AckRequest && length === 12 && this._connectionState === ConnectionState.SynSent) {
			this._connectionState = ConnectionState.Established
			this._sendAck(remotePacketId)
			this._lastReceivedPacketId = remotePacketId
		}

		// Device ack'ed our command
		if (flags & PacketFlag.AckReply && this._connectionState === ConnectionState.Established) {
			const ackPacketId = packet.readUInt16BE(4)
			this._lastAcked = ackPacketId
			for (const i in this._inFlight) {
				if (ackPacketId >= this._inFlight[i].packetId || this._localPacketId < this._inFlight[i].packetId) {
					this.emit(IPCMessageType.CommandAcknowledged, this._inFlight[i].packetId, this._inFlight[i].trackingId)
					this._inFlight.splice(Number(i), 1)
				}
			}
		}
	}

	private _sendPacket (packet: Buffer) {
		if (this._debug) this.log('SEND ', packet)
		this._socket.send(packet, 0, packet.length, this._port, this._address)
	}

	private _attemptAck (packetId: number) {
		this._lastReceivedPacketId = packetId
		this._receivedWithoutAck++
		if (this._receivedWithoutAck === 16) {
			this._receivedWithoutAck = 0
			this._hasTimeout = false
			this._ackTimer.clearTimeout()
			this._sendAck(this._lastReceivedPacketId)
		} else if (!this._hasTimeout) {
			this._hasTimeout = true
			// timeout for 5 ms (syntax for nanotimer says m)
			this._ackTimer.setTimeout(() => {
				this._receivedWithoutAck = 0
				this._hasTimeout = false
				this._sendAck(this._lastReceivedPacketId)
			}, [], '5m')
		}
	}

	private _sendAck (packetId: number) {
		const buffer = Buffer.alloc(12, 0)
		buffer.writeUInt16BE(0x800C, 0) // Opcode & Length
		buffer.writeUInt16BE(this._sessionId, 2)
		buffer.writeUInt16BE(packetId, 4)
		buffer.writeUInt8(0x41, 9)
		this._sendPacket(buffer)
	}

	private _checkForRetransmit () {
		let retransmitFromPacketId: number | undefined
		for (const sentPacket of this._inFlight) {
			if (sentPacket.packetId <= this._lastAcked || sentPacket.packetId > this._localPacketId) {
				this.emit(IPCMessageType.CommandAcknowledged, sentPacket.packetId, sentPacket.trackingId)
				this._inFlight.splice(this._inFlight.indexOf(sentPacket), 1)
				continue
			}
			if (retransmitFromPacketId && sentPacket.packetId > retransmitFromPacketId) {
				sentPacket.lastSent = Date.now()
				sentPacket.resent++
				this._sendPacket(sentPacket.packet)
			} else if (sentPacket && sentPacket.lastSent + IN_FLIGHT_TIMEOUT < Date.now()) {
				if (sentPacket.resent <= MAX_PACKET_RETRIES && sentPacket.packetId < this.nextPacketId) {
					sentPacket.lastSent = Date.now()
					sentPacket.resent++

					this.log('Resending', sentPacket.packetId)
					if (this._debug) {
						this.log('RESEND: ', sentPacket)
					}
					this._sendPacket(sentPacket.packet)
					retransmitFromPacketId = sentPacket.packetId
				} else {
					this.emit(IPCMessageType.CommandTimeout, sentPacket.packetId, sentPacket.trackingId)
					this._inFlight.splice(this._inFlight.indexOf(sentPacket), 1)

					this.log('Timed out: ', sentPacket.packetId)
					if (this._debug) {
						this.log('TIMED OUT: ', sentPacket.packet)
					}
					// @todo: we should probably break up the connection here.
				}
			}
		}
	}
}
