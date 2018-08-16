import { Enums } from '..'

export namespace Util {
	export function stringToBytes (str: string): Array<number> {
		const array = []
		for (const val of Buffer.from(str).values()) {
			array.push(val)
		}
		return array
	}

	export function bufToNullTerminatedString (buffer: Buffer, start: number, length: number): string {
		const slice = buffer.slice(start, start + length)
		const nullIndex = slice.indexOf('\0')
		return slice.toString('ascii', 0, nullIndex < 0 ? slice.length : nullIndex)
	}

	export const COMMAND_CONNECT_HELLO = Buffer.from([
		0x10, 0x14, 0x53, 0xAB,
		0x00, 0x00, 0x00, 0x00,
		0x00, 0x3A, 0x00, 0x00,
		0x01, 0x00, 0x00, 0x00,
		0x00, 0x00, 0x00, 0x00
	])

	export const COMMAND_CONNECT_HELLO_ANSWER = Buffer.from([
		0x80, 0x0C, 0x53, 0xAB,
		0x00, 0x00, 0x00, 0x00,
		0x00, 0x03, 0x00, 0x00
	])

	/**
	 * @todo: BALTE - 2018-5-24:
	 * Create util functions that handle proper colour spaces in UHD.
	 */
	export function convertRGBAToYUV422 (width: number, height: number, data: Buffer) {
		// BT.709 or BT.601
		const KR = height >= 720 ? 0.2126 : 0.299
		const KB = height >= 720 ? 0.0722 : 0.114
		const KG = 1 - KR - KB

		const KRi = 1 - KR
		const KBi = 1 - KB

		const YRange = 219
		const CbCrRange = 224
		const HalfCbCrRange = CbCrRange / 2

		const YOffset = 16 << 8
		const CbCrOffset = 128 << 8

		const KRoKBi = KR / KBi * HalfCbCrRange
		const KGoKBi = KG / KBi * HalfCbCrRange
		const KBoKRi = KB / KRi * HalfCbCrRange
		const KGoKRi = KG / KRi * HalfCbCrRange

		const buffer = new Buffer(width * height * 4)
		let i = 0
		while (i < width * height * 4) {
			const r1 = data[i + 0]
			const g1 = data[i + 1]
			const b1 = data[i + 2]

			const r2 = data[i + 4]
			const g2 = data[i + 5]
			const b2 = data[i + 6]

			const a1 = ((data[i + 3] << 2) * 219 / 255) + (16 << 2)
			const a2 = ((data[i + 7] << 2) * 219 / 255) + (16 << 2)

			const y16a = YOffset + KR * YRange * r1 + KG * YRange * g1 + KB * YRange * b1
			const cb16 = CbCrOffset + (-KRoKBi * r1 - KGoKBi * g1 + HalfCbCrRange * b1)
			const y16b = YOffset + KR * YRange * r2 + KG * YRange * g2 + KB * YRange * b2
			const cr16 = CbCrOffset + (HalfCbCrRange * r1 - KGoKRi * g1 - KBoKRi * b1)

			const y1 = Math.round(y16a) >> 6
			const u1 = Math.round(cb16) >> 6
			const y2 = Math.round(y16b) >> 6
			const v2 = Math.round(cr16) >> 6

			buffer[i + 0] = a1 >> 4
			buffer[i + 1] = ((a1 & 0x0f) << 4) | (u1 >> 6)
			buffer[i + 2] = ((u1 & 0x3f) << 2) | (y1 >> 8)
			buffer[i + 3] = y1 & 0xff
			buffer[i + 4] = a2 >> 4
			buffer[i + 5] = ((a2 & 0x0f) << 4) | (v2 >> 6)
			buffer[i + 6] = ((v2 & 0x3f) << 2) | (y2 >> 8)
			buffer[i + 7] = y2 & 0xff
			i = i + 8
		}
		return buffer
	}

	export function getResolution (videoMode: Enums.VideoMode) {
		const PAL = [720, 576]
		const NTSC = [640, 480]
		const HD = [1280, 720]
		const FHD = [1920, 1080]
		const UHD = [3840, 2160]

		const enumToResolution = [
			NTSC, PAL, NTSC, PAL,
			HD, HD,
			FHD, FHD, FHD, FHD, FHD, FHD, FHD, FHD,
			UHD, UHD, UHD, UHD,
			UHD, UHD
		]

		return enumToResolution[videoMode]
	}
}