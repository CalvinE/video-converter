import { assert } from "chai";
import { bytesToHumanReadableBytes, HHMMSSmmToMilliseconds, HHMMSSmmToSeconds, millisecondsToHHMMSS } from "../PrettyPrint"

describe('PrettyPrint', () => {
    describe('millisecondsToHHMMSS', () => {
        it('should take milliseconds totaling multiple days and render properly', () => {
            const result = millisecondsToHHMMSS(280_800_000 + 600_000 + 8_000);
            assert.equal(result, "78:10:08")
        });
    });
    describe('bytesToHumanReadableBytes', () => {
        it('should convert to appropriate terabyte value', () => {
            const result = bytesToHumanReadableBytes(1_890_000_000_000);
            assert.equal("1.89TB", result);
        });
        it('should convert to appropriate gigabyte value', () => {
            const result = bytesToHumanReadableBytes(1_890_000_000);
            assert.equal("1.89GB", result);
        });
        it('should convert to appropriate megabyte value', () => {
            const result = bytesToHumanReadableBytes(1_890_000);
            assert.equal("1.89MB", result);
        });
        it('should convert to appropriate kilobyte value', () => {
            const result = bytesToHumanReadableBytes(1_890);
            assert.equal("1.89KB", result);
        });
        it('should convert to appropriate byte value', () => {
            const result = bytesToHumanReadableBytes(890);
            assert.equal("890B", result);
        });
        it('should properly label negative bytes', () => {
            const result = bytesToHumanReadableBytes(-1_890);
            assert.equal("-1.89KB", result);
        })
    });
    describe('HHMMSSmmToMilliseconds', () => {
        it('should return proper value given properly formatted string', () => {
            const testString = "00:00:03.24";
            const expectedValue = 3240;
            const actual = HHMMSSmmToMilliseconds(testString);
            assert.equal(actual, expectedValue);
        });
    });
    describe('HHMMSSmmToSeconds', () => {
        it('should return proper value given properly formatted string', () => {
            const testString = "00:00:03.24";
            const expectedValue = 3.24;
            const actual = HHMMSSmmToSeconds(testString);
            assert.equal(actual, expectedValue);
        });
    });
});