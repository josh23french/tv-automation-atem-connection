import { Commands, Enums } from '..'

import DataLock from './dataLock'
import DataTransferFrame from './dataTransferFrame'
import DataTransferStill from './dataTransferStill'
import DataTransferClip from './dataTransferClip'
import DataTransferAudio from './dataTransferAudio'
import { ISerializableCommand } from '../commands/CommandBase'

const MAX_PACKETS_TO_SEND_PER_TICK = 10

export class DataTransferManager {
	readonly commandQueue: Array<ISerializableCommand> = []

	readonly stillsLock = new DataLock(0, cmd => this.commandQueue.push(cmd))
	readonly clipLocks = [
		new DataLock(1, cmd => this.commandQueue.push(cmd)),
		new DataLock(2, cmd => this.commandQueue.push(cmd))
	]

	private interval: NodeJS.Timer | undefined

	transferIndex = 0

	start (sendCommand: (command: ISerializableCommand) => Promise<ISerializableCommand>) {
		if (!this.interval) {
			this.interval = setInterval(() => {
				if (this.commandQueue.length <= 0) {
					return
				}

				const commandsToSend = this.commandQueue.splice(0, MAX_PACKETS_TO_SEND_PER_TICK)
				commandsToSend.forEach(command => {
					sendCommand(command).catch(() => { /* discard error */ })
				})
			}, 0) // TODO - should this be done slower?
		}
	}
	stop () {
		if (this.interval) {
			clearInterval(this.interval)
			this.interval = undefined
		}
	}

	handleCommand (command: Commands.IDeserializedCommand) {
		const allLocks = [ this.stillsLock, ...this.clipLocks ]

		// try to establish the associated DataLock:
		let lock: DataLock | undefined
		if (command.constructor.name === Commands.LockObtainedCommand.name || command.constructor.name === Commands.LockStateUpdateCommand.name) {
			switch (command.properties.index) {
				case 0 :
					lock = this.stillsLock
					break
				case 1 :
					lock = this.clipLocks[0]
					break
				case 2 :
					lock = this.clipLocks[1]
					break
			}
		} else if (command.properties.storeId) {
			lock = allLocks[command.properties.storeId]
		} else if (command.properties.transferId !== undefined || command.properties.transferIndex !== undefined) {
			for (const _lock of allLocks) {
				if (_lock.activeTransfer && (_lock.activeTransfer.transferId === command.properties.transferId || _lock.activeTransfer.transferId === command.properties.transferIndex)) {
					lock = _lock
				}
			}
		} else {
			// debugging:
			console.log('UNKNOWN COMMAND:', command)
			return
		}
		if (!lock) return

		console.log('CMD', command.constructor.name)

		// handle actual command
		if (command.constructor.name === Commands.LockObtainedCommand.name) {
			lock.lockObtained()
		}
		if (command.constructor.name === Commands.LockStateUpdateCommand.name) {
			if (!command.properties.locked) lock.lostLock()
			else lock.updateLock(command.properties.locked)
		}
		if (command.constructor.name === Commands.DataTransferErrorCommand.name) {
			lock.transferErrored(command.properties.errorCode)
		}
		if (lock.activeTransfer) {
			lock.activeTransfer.handleCommand(command).forEach(cmd => this.commandQueue.push(cmd))
			if (lock.activeTransfer.state === Enums.TransferState.Finished) {
				lock.transferFinished()
			}
		}
	}

	uploadStill (index: number, data: Buffer, name: string, description: string) {
		const transfer = new DataTransferStill(this.transferIndex++, index, data, name, description)
		return this.stillsLock.enqueue(transfer)
	}

	uploadClip (index: number, data: Array<Buffer>, name: string) {
		const transfer = new DataTransferClip(1 + index, name)
		transfer.frames = data.map((frame, id) => new DataTransferFrame(this.transferIndex++, 1 + index, id, frame))

		return this.clipLocks[index].enqueue(transfer)
	}

	uploadAudio (index: number, data: Buffer, name: string) {
		const transfer = new DataTransferAudio(this.transferIndex++, 1 + index, data, name)
		return this.clipLocks[index].enqueue(transfer)
	}

}
