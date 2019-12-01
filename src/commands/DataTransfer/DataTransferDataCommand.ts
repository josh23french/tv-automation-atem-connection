import { BasicWritableCommand, IDeserializedCommand } from '../CommandBase'

export interface DataTransferDataProps {
	transferId: number
	body: Buffer
}

export class DataTransferDataCommand extends BasicWritableCommand<DataTransferDataProps> implements IDeserializedCommand {
	public static readonly rawName = 'FTDa'

	public serialize () {
		const buffer = Buffer.alloc(4)
		buffer.writeUInt16BE(this.properties.transferId, 0)
		buffer.writeUInt16BE(this.properties.body.length, 2)

		return Buffer.concat([ buffer, this.properties.body ])
	}

	public static deserialize (rawCommand: Buffer): DataTransferDataCommand {
		const properties = {
			transferId: rawCommand.readUInt16BE(0),
			size: rawCommand.readUInt16BE(2),
			body: rawCommand.slice(4, 4 + rawCommand.readUInt16BE(2))
		}

		return new DataTransferDataCommand(properties)
	}

	public applyToState (): string[] {
		// Nothing to do
		return []
	}
}
