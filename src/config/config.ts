import * as R from "ramda"
import { CodeInputMode } from "../types"

export const getConfig = (): Config => {
  const tgServerIP = process.env.TG_SERVER_IP
  const tgServerPort = process.env.TG_SERVER_PORT ? parseInt(process.env.TG_SERVER_PORT) : undefined
  const tgDCId = process.env.TG_DC_ID ? parseInt(process.env.TG_DC_ID) : undefined

  const phoneNumber = process.env.USER_PHONE_NUMBER
  const password = process.env.USER_PASSWORD

  const apiId = parseInt(process.env.TG_API_ID || '')
  const apiHash = process.env.TG_API_HASH
  
  const codeInputMode: CodeInputMode = "WEB"

  let codeServerPort = parseInt(process.env.CODE_SEVER_PORT || '9001')

  if (isNaN(codeServerPort)) codeServerPort = 9001

  const botToken = process.env.TG_BOT_TOKEN

  // Guard for bot token
  if (R.isNil(botToken)) {
    console.error("Invalid bot token")
    process.exit(201)
  }
  
  if (R.isNil(phoneNumber) || R.isNil(password)) {
    console.error("Invalid client credentials")
    process.exit(202)
  }

  if (isNaN(apiId) || R.isNil(apiHash)) {
    console.log("Invalid telegram api credentials");
    process.exit(203)
  }

  return {
    ip: tgServerIP,
    port: tgServerPort,
    dcId: tgDCId,
    phoneNumber: phoneNumber,
    password: password,
    apiId: apiId,
    apiHash: apiHash,
    codeInputMode: codeInputMode,
    codeServerPort: codeServerPort,
    botToken: botToken
  }
}

export type Config = {
  ip?: string,
  port?: number,
  dcId?: number,
  phoneNumber: string,
  password: string,
  apiId: number,
  apiHash: string,
  codeInputMode: CodeInputMode,
  codeServerPort: number,
  botToken: string
}
