import { Commands, Enums } from '..'

import DataTransfer from './dataTransfer'
import DataTransferFrame from './dataTransferFrame'

export default class DataTransferClip extends DataTransfer {
	public readonly clipIndex: number // 0 or 1
	public readonly frames: Array<DataTransferFrame>
	public readonly name: string
	public curFrame = 0

	constructor (clipIndex: number, name: string, frames: Array<DataTransferFrame>) {
		super(0, 1 + clipIndex)

		this.clipIndex = clipIndex
		this.name = name
		this.frames = frames
	}

	public start () {
		const commands: Commands.ISerializableCommand[] = []
		commands.push(new Commands.MediaPoolClearClipCommand(this.clipIndex))
		this.frames[this.curFrame].state = Enums.TransferState.Locked
		commands.push(...this.frames[this.curFrame].start())
		return commands
	}

	public handleCommand (command: Commands.IDeserializedCommand): Commands.ISerializableCommand[] {
		const commands: Commands.ISerializableCommand[] = []

		commands.push(...this.frames[this.curFrame].handleCommand(command))
		if (this.state !== Enums.TransferState.Transferring) this.state = Enums.TransferState.Transferring
		if (this.frames[this.curFrame].state === Enums.TransferState.Finished) {
			this.curFrame++
			if (this.curFrame < this.frames.length) {
				this.frames[this.curFrame].state = Enums.TransferState.Locked
				commands.push(...this.frames[this.curFrame].start())
			} else {
				const command = new Commands.MediaPoolSetClipCommand({
					index: this.clipIndex,
					name: this.name,
					frames: this.frames.length
				})
				commands.push(command)
				this.state = Enums.TransferState.Finished
			}
		}

		return commands
	}

	get transferId () {
		return this.frames[this.curFrame].transferId
	}

	public gotLock (): Commands.ISerializableCommand[] {
		this.state = Enums.TransferState.Locked
		return this.start()
	}
}
