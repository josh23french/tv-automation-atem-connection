/// <reference types="node" />
import { IPCMessageType } from '../enums';
import { Enums } from '..';
export declare namespace Util {
    function stringToBytes(str: string): Array<number>;
    function bufToNullTerminatedString(buffer: Buffer, start: number, length: number): string;
    function parseNumberBetween(num: number, min: number, max: number): number;
    function parseEnum<G>(value: G, type: any): G;
    function sendIPCMessage(scope: any, processProperty: string, message: {
        cmd: IPCMessageType;
        payload?: any;
        _messageId?: number;
    }, log: Function): Promise<{}>;
    const COMMAND_CONNECT_HELLO: Buffer;
    const COMMAND_CONNECT_HELLO_ANSWER: Buffer;
    /**
     * @todo: BALTE - 2018-5-24:
     * Create util functions that handle proper colour spaces in UHD.
     */
    function convertRGBAToYUV422(width: number, height: number, data: Buffer): Buffer;
    function getResolution(videoMode: Enums.VideoMode): number[];
    function convertWAVToRaw(inputBuffer: Buffer): Buffer;
}