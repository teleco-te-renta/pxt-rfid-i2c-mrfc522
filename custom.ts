/**
 * RFID MFRC522 I2C driver
 */
//% weight=20 color="#AA278D" icon="\uf2bb" block="RFID I2C MFRC522"
namespace mfrc522 {
    let _instance: MFRC522 | null = null;

    /**
     * Initialize the RFID MFRC522 module
     * @param address I2C address, default 0x28
     */
    //% block="initialize RFID MFRC522 at address %address"
    //% address.defl=0x28
    //% weight=90
    export function init(address: number = 0x28) {
        if (!_instance) {
            _instance = new MFRC522(address);
        }
        _instance.init();
    }

    /**
     * Reads the UID of a card if detected
     */
    //% block="read RFID UID"
    //% weight=80
    export function readUID(): string {
        if (!_instance) return "";

        // Request card
        let result = _instance.request(MFRC522.PICC_REQIDL);
        if (result.status != 0) {
            // Try requesting all if IDL failed, or just fail
            return "";
        }

        // Anti-collision to get UID
        let anti = _instance.anticoll();
        if (anti.status == 0) {
            // Convert UID to hex string
            let hex = "";
            for (let i = 0; i < anti.uid.length; i++) {
                let byte = anti.uid[i];
                if (byte < 16) hex += "0";
                hex += byte.toString();
            }
            return hex.toUpperCase();
        }
        return "";
    }

    export class MFRC522 {
        address: number;

        // Register Definitions
        static PCD_IDLE = 0x00;
        static PCD_AUTHENT = 0x0E;
        static PCD_RECEIVE = 0x08;
        static PCD_TRANSMIT = 0x04;
        static PCD_TRANSCEIVE = 0x0C;
        static PCD_RESETPHASE = 0x0F;
        static PCD_CALCCRC = 0x03;

        static PICC_REQIDL = 0x26;
        static PICC_REQALL = 0x52;
        static PICC_ANTICOLL = 0x93;
        static PICC_SElECTTAG = 0x93;
        static PICC_AUTHENT1A = 0x60;
        static PICC_AUTHENT1B = 0x61;
        static PICC_READ = 0x30;
        static PICC_WRITE = 0xA0;
        static PICC_DECREMENT = 0xC0;
        static PICC_INCREMENT = 0xC1;
        static PICC_RESTORE = 0xC2;
        static PICC_TRANSFER = 0xB0;
        static PICC_HALT = 0x50;

        // MFRC522 Registers
        // Page 0: Command and Status
        static CommandReg = 0x01;
        static ComIEnReg = 0x02;
        static DivIEnReg = 0x03;
        static ComIrqReg = 0x04;
        static DivIrqReg = 0x05;
        static ErrorReg = 0x06;
        static Status1Reg = 0x07;
        static Status2Reg = 0x08;
        static FIFODataReg = 0x09;
        static FIFOLevelReg = 0x0A;
        static WaterLevelReg = 0x0B;
        static ControlReg = 0x0C;
        static BitFramingReg = 0x0D;
        static CollReg = 0x0E;

        // Page 1: Command
        static ModeReg = 0x11;
        static TxModeReg = 0x12;
        static RxModeReg = 0x13;
        static TxControlReg = 0x14;
        static TxASKReg = 0x15;
        static TxSelReg = 0x16;
        static RxSelReg = 0x17;
        static StyleReg = 0x18; // reserved, but used in some libs

        // Page 2: CFG
        static CRCResultRegM = 0x21;
        static CRCResultRegL = 0x22;
        static ModeWidthReg = 0x24; // reserved
        static RFCfgReg = 0x26;
        static GsNReg = 0x27;
        static CWGsPReg = 0x28;
        static ModGsPReg = 0x29;
        static TModeReg = 0x2A;
        static TPrescalerReg = 0x2B;
        static TReloadRegH = 0x2C;
        static TReloadRegL = 0x2D;
        static TCounterValRegH = 0x2E;
        static TCounterValRegL = 0x2F;

        constructor(address: number = 0x28) {
            this.address = address;
        }

        /**
         * Writes a byte to a register
         */
        writeRegister(reg: number, value: number) {
            let buf = pins.createBuffer(2);
            buf[0] = reg;
            buf[1] = value;
            pins.i2cWriteBuffer(this.address, buf);
        }

        /**
         * Reads a byte from a register
         */
        readRegister(reg: number): number {
            pins.i2cWriteNumber(this.address, reg, NumberFormat.UInt8BE);
            return pins.i2cReadNumber(this.address, NumberFormat.UInt8BE);
        }

        /**
         * Sets bits in a register
         */
        setRegisterBitMask(reg: number, mask: number) {
            let tmp = this.readRegister(reg);
            this.writeRegister(reg, tmp | mask);
        }

        /**
         * Clears bits in a register
         */
        clearRegisterBitMask(reg: number, mask: number) {
            let tmp = this.readRegister(reg);
            this.writeRegister(reg, tmp & (~mask));
        }

        /**
         * Initializes the MFRC522
         */
        init() {
            // Soft Reset
            this.writeRegister(MFRC522.CommandReg, MFRC522.PCD_RESETPHASE);
            basic.pause(50);

            // Timer: TPrescaler*TreloadVal/6.78MHz = 24ms
            this.writeRegister(MFRC522.TModeReg, 0x8D); // Tauto=1; f(Timer) = 6.78MHz/TPreScaler
            this.writeRegister(MFRC522.TPrescalerReg, 0x3E); // TModeReg[3..0] + TPrescalerReg
            this.writeRegister(MFRC522.TReloadRegH, 0);
            this.writeRegister(MFRC522.TReloadRegL, 30);

            this.writeRegister(MFRC522.TxASKReg, 0x40); // 100%ASK
            this.writeRegister(MFRC522.ModeReg, 0x3D); // CRC initial value 0x6363

            this.antennaOn();
        }

        antennaOn() {
            let temp = this.readRegister(MFRC522.TxControlReg);
            if ((temp & 0x03) == 0) {
                this.setRegisterBitMask(MFRC522.TxControlReg, 0x03);
            }
        }

        /**
         * Sends a command to the card and reads response
         */
        toCard(command: number, sendData: number[]): { status: number, data: number[], backLen: number } {
            let status = MFRC522.Status1Reg; // Use as temporary status var, typically MI_ERR or MI_OK
            let irqEn = 0x00;
            let waitIRq = 0x00;
            let lastBits = 0;
            let n = 0;

            if (command == MFRC522.PCD_AUTHENT) {
                irqEn = 0x12;
                waitIRq = 0x10;
            } else if (command == MFRC522.PCD_TRANSCEIVE) {
                irqEn = 0x77;
                waitIRq = 0x30;
            }

            this.writeRegister(MFRC522.ComIEnReg, irqEn | 0x80);
            this.clearRegisterBitMask(MFRC522.ComIrqReg, 0x80);
            this.setRegisterBitMask(MFRC522.FIFOLevelReg, 0x80); // FlushBuffer

            this.writeRegister(MFRC522.CommandReg, MFRC522.PCD_IDLE);

            // Write data to FIFO
            for (let i = 0; i < sendData.length; i++) {
                this.writeRegister(MFRC522.FIFODataReg, sendData[i]);
            }

            // Execute command
            this.writeRegister(MFRC522.CommandReg, command);
            if (command == MFRC522.PCD_TRANSCEIVE) {
                this.setRegisterBitMask(MFRC522.BitFramingReg, 0x80); // StartSend
            }

            // Wait for command completion
            let i = 2000;
            while (i > 0) {
                n = this.readRegister(MFRC522.ComIrqReg);
                if (n & waitIRq) {
                    break;
                }
                if (n & 0x01) { // Timer interrupt
                    break;
                }
                i--;
            }

            let backData: number[] = [];
            let backLen = 0;

            if (i != 0) {
                if ((this.readRegister(MFRC522.ErrorReg) & 0x1B) == 0) {
                    status = 0; // MI_OK

                    if (n & irqEn & 0x01) {
                        status = 1; // MI_NOTAGERR
                    }

                    if (command == MFRC522.PCD_TRANSCEIVE) {
                        n = this.readRegister(MFRC522.FIFOLevelReg);
                        lastBits = this.readRegister(MFRC522.ControlReg) & 0x07;
                        if (lastBits != 0) {
                            backLen = (n - 1) * 8 + lastBits;
                        } else {
                            backLen = n * 8;
                        }

                        if (n == 0) {
                            n = 1;
                        }
                        if (n > 16) {
                            n = 16;
                        }

                        for (let k = 0; k < n; k++) {
                            backData.push(this.readRegister(MFRC522.FIFODataReg));
                        }
                    }
                } else {
                    status = 2; // MI_ERR
                }
            } else {
                status = 2; // MI_ERR
            }

            return { status: status, data: backData, backLen: backLen };
        }

        /**
         * Request card
         */
        request(reqMode: number): { status: number, type: number } {
            let status = 0;
            let bitFraming = 0x07; // TxLastBists: 7 bits

            this.writeRegister(MFRC522.BitFramingReg, bitFraming);

            let result = this.toCard(MFRC522.PCD_TRANSCEIVE, [reqMode]);

            if ((result.status != 2) && (result.backLen == 0x10)) {
                status = 0; // MI_OK
            } else {
                status = 2; // MI_ERR
            }

            return { status: status, type: result.data[0] };
        }

        /**
         * Anti-collision detection to read UID
         */
        anticoll(): { status: number, uid: number[] } {
            this.writeRegister(MFRC522.BitFramingReg, 0x00);

            let result = this.toCard(MFRC522.PCD_TRANSCEIVE, [MFRC522.PICC_ANTICOLL, 0x20]);

            let status = 2; // MI_ERR
            let uid: number[] = [];

            if (result.status == 0) { // MI_OK
                // Check if we received 5 bytes (4 byte UID + 1 byte BCC)
                if (result.data.length == 5) {
                    // CRC check could be done here (XOR of first 4 bytes should equal 5th)
                    let bcc = 0;
                    for (let i = 0; i < 4; i++) {
                        bcc ^= result.data[i];
                        uid.push(result.data[i]);
                    }
                    if (bcc == result.data[4]) {
                        status = 0;
                    }
                }
            }

            return { status: status, uid: uid };
        }
    }

}
