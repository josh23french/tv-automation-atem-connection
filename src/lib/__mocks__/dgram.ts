import { EventEmitter } from 'events'
import { SocketType, RemoteInfo } from 'dgram'
import 'jest-extended'
import { DEFAULT_PORT } from '../../atem'

export class Socket extends EventEmitter {
	public isOpen: boolean = false

	public expectedAddress?: string
	public expectedPort?: number

	constructor () {
		super()
	}

	public sendImpl?: (msg: Buffer) => void

	public emitMessage (msg: Buffer) {
		expect(Buffer.isBuffer(msg)).toBeTruthy()

		const rinfo: RemoteInfo = {
			address: this.expectedAddress || '127.0.0.1',
			port: this.expectedPort || DEFAULT_PORT,
			family: 'IPv4',
			size: msg.length
		}
		this.emit('message', msg, rinfo)
	}

	public bind (port?: number, address?: string, callback?: () => void): void {
		expect(port).toBeUndefined()
		expect(address).toBeUndefined()
		expect(callback).toBeUndefined()

		this.isOpen = true
	}

	public send (msg: string | Uint8Array, offset: number, length: number, port: number, address?: string, callback?: (error: Error | null, bytes: number) => void): void {
		expect(Buffer.isBuffer(msg)).toBeTruthy()
		expect(offset).toBeNumber()
		expect(length).toBeNumber()
		expect(port).toBeNumber()
		expect(address).toBeString()
		expect(callback).toBeUndefined()

		if (this.expectedAddress) {
			expect(address).toEqual(this.expectedAddress)
		}
		if (this.expectedPort) {
			expect(port).toEqual(this.expectedPort)
		}

		if (this.sendImpl) {
			this.sendImpl(msg as Buffer)
		}
	}

	public close (cb?: Function) {
		this.isOpen = false
		// TODO - optional delay?
		if (cb) cb()
	}
}

export function createSocket (type: SocketType, callback?: (msg: Buffer, rinfo: RemoteInfo) => void): Socket {
	expect(type).toEqual('udp4')
	expect(callback).toBeUndefined()

	return new Socket()
}
