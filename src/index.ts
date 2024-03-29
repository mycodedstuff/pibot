// Third party dependencies
import { Context, Telegraf, Markup } from 'telegraf'
import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions'
import * as R from "ramda"
const input = require("input")
import ngrok from "ngrok"

// Local modules
import * as constants from "./config/constants"
import { startMediaDownload } from "./utils/downloader"
import { getConfig } from './config/config'
import { Download, PiState } from "./types"
import * as server from "./server"
import { Server } from "http"
import { buttons, constructDownloadList, constructPageButtons, getCallbackTypeFromQuery, isMessageTypeMedia, mkSeasonButtons, shouldAskForSeason } from './utils/utils'

// Globals
const downloads = new Map<string, Download>()

//Telegram client session
const config = getConfig()
const telegramSession = new StringSession('')

if (!R.isNil(config.ip) && !R.isNil(config.port) && !R.isNil(config.dcId)) {
  telegramSession.setDC(config.dcId, config.ip, config.port)
}

const client = new TelegramClient(telegramSession, config.apiId, config.apiHash, { connectionRetries: 5 })

// Telegram bot
const bot = new Telegraf(config.botToken)

const state: PiState = {
  client: client,
  bot: bot,
  downloads: downloads,
  config: config,
  pendingDownloads: new Map()
}

bot.catch((error, _) => {
  console.error("Exception captured by error handler", error)
})

// Middleware to allow messages from whitelisted usernames/ids
bot.use((ctx, next) => {
  if (ctx.from && !ctx.from.is_bot && (config.whitelistedUsers.findIndex((identity => ctx.from?.username === identity || ctx.from?.id === parseInt(identity))) != -1)) {
    next()
  } else {
    console.warn("Blocking event from", JSON.stringify(ctx.update))
  }
})

// Middleware to log all messages
bot.use((ctx, next) => {
  if (ctx.message)
    console.log(JSON.stringify(ctx.message))
  next()
})

// Configure commands
bot.start(ctx => ctx.reply(constants.welcomeMsg))
bot.help(ctx => ctx.reply(constants.helpMsg))

bot.command("/downloads", ctx => {
  if (downloads.size > 0) {
    const pageButtons = constructPageButtons(state, 1)
    ctx.reply(constructDownloadList(state, 1), {
      reply_markup: Markup.inlineKeyboard([[buttons.refreshDownloadBtn], pageButtons]).reply_markup
    })
  } else {
    ctx.reply("No downloads in progress.")
  }
})

bot.command("/connect", async ctx => {
  if (!client.connected) {
    await startTgClient(ctx)
  } else {
    ctx.reply("Client already connected.")
  }
})

bot.command("/disconnect", async ctx => {
  if (client.connected) {
    await client.disconnect()
    ctx.reply("Client disconnected.")
  } else {
    ctx.reply("Client already disconnected.")
  }
})

bot.on("callback_query", async (ctx) => {
  try {
    const callbackQuery = R.path(["data"], ctx.update.callback_query) as string | undefined
    if (R.isNil(callbackQuery)) return
    const callbackType = getCallbackTypeFromQuery(callbackQuery)
    console.log("Callback query", callbackQuery, callbackType);
    if (callbackType == "REFRESH_DOWNLOAD") {
      const pageButtons = constructPageButtons(state, 1)
      ctx.editMessageText(constructDownloadList(state, 1), {
        reply_markup: Markup.inlineKeyboard([[buttons.refreshDownloadBtn], pageButtons]).reply_markup
      })
    } else if (callbackType == "NAVIGATE_PAGE") {
      const currentPageNo = parseInt(R.split("_", callbackQuery)[2])
      const pageButtons = constructPageButtons(state, currentPageNo)
      const msg = constructDownloadList(state, currentPageNo)
      ctx.editMessageText(msg, {
        reply_markup: Markup.inlineKeyboard([[buttons.refreshDownloadBtn], pageButtons]).reply_markup
      })
    } else if (callbackType == "CATEGORY_SELECTED") {
      const splitArr = R.split("_", callbackQuery)
      const category = splitArr[1]
      const identifier = splitArr[2]
      if (shouldAskForSeason(category)) {
        ctx.editMessageText(`You selected ${category}, choose season for this media.`, {
          reply_markup: Markup.inlineKeyboard(mkSeasonButtons(category, identifier, 0, 8), { columns: 3 }).reply_markup //TODO: Add support for more seasons
        })
      } else {
        const work = state.pendingDownloads.get(identifier)
        if (!R.isNil(work)) {
          ctx.editMessageText(`You selected category ${category}.`)
          console.log("Starting pending download", identifier)
          await (category === "Others" ? work(constants.defaultMediaCategory) : work(category))
        } else {
          console.warn("Couldn't find the pending download", identifier);
        }
      }
    } else if (callbackType == "SEASON_SELECTED") {
      const splitArr = R.split("_", callbackQuery)
      const season = parseInt(splitArr[1])
      const category = splitArr[2]
      const identifier = splitArr[3]
      const work = state.pendingDownloads.get(identifier)
      if (!R.isNil(work)) {
        ctx.editMessageText(`You selected Category ${category} and ` + (season === 0 ? 'Specials.' : `Season ${season}.`))
        console.log("Starting pending download", identifier)
        await (category === "Others" ? work(constants.defaultMediaCategory, season) : work(category, season))
      } else {
        console.warn("Couldn't find the pending download", identifier);
      }
    }
  } catch (error) {
    console.error("Exception captured in callback_query handler", error)
  }
})

// Configure events
// TODO: Add support to download direct uploads to bot
bot.on(["document", "video"], async (ctx) => {
  await startMediaDownload(state, ctx, ctx.message)
})

bot.command("/redownload", async (ctx) => {
  const message = ctx.message.reply_to_message
  if (!R.isNil(message)) {
    if (isMessageTypeMedia(message)) {
      await startMediaDownload(state, ctx, message, true)
    } else {
      ctx.reply("Replied message isn't a video/document.", {
        reply_to_message_id: ctx.message.message_id
      })
    }
  } else {
    ctx.reply("Reply to a video/document to redownload it.", {
      reply_to_message_id: ctx.message.message_id
    })
  }
})

// Start PiBot
const startPiBot = async () => {
  try {
    console.log("Starting PiBot!")
    await bot.launch()
  } catch (error) {
    console.log("Error in launching bot", error);
  }
}

// Start client
const startTgClient = async (ctx: Context) => {
  try {
    ctx.reply("Connecting...")
    await telegramSession.load()
    await client.start({
      phoneNumber: config.phoneNumber,
      password: async () => config.password,
      phoneCode: () => getTgCode(ctx),
      onError: (err) => console.log("Client error", err),
    });
    client.session.save()
    console.log('You should now be connected.')
    ctx.reply("Client is connected.")
  } catch (error) {
    console.log("Exception occurred while starting client", error)
    ctx.reply("Couldn't connect the client.")
  }
}


const getTgCode = (ctx: Context): Promise<string> => {
  return new Promise(async (resolve, reject) => {
    try {
      switch (config.codeInputMode) {
        case "WEB": {
          const app = server.initServer(config.codeServerPort, async (appServer: Server, code: string) => {
            await ngrok.kill()
            await server.stopServer(appServer)
            resolve(code)
          })
          try {
            await ngrok.kill()
            const url = await ngrok.connect({
              addr: config.codeServerPort,
              onStatusChange: (status) => {
                console.log("Ngrok tunnel on", config.codeServerPort, status);
              }
            })
            ctx.reply(`Provide the 2FA code using this => ${url}.`, {
              disable_web_page_preview: true
            })
          } catch (error) {
            console.log("Exception in starting ngrok", error);
            await ngrok.kill()
            await server.stopServer(app)
            reject("Error in ngrok")
          }
          break
        }
        default: {
          ctx.reply("Provide the 2FA code via cli.")
          resolve(await input.text("Code ?"))
        }
      }
    } catch (error) {
      console.log("Error occurred while fetching code using", config.codeInputMode, error);
      reject(error)
    }
  })
}

// Enable graceful stop
const stopPiBot = (reason?: string) => {
  return () => {
    if (!client.disconnected) client.disconnect()
    bot.stop(reason)
    ngrok.kill()
    setTimeout((_: any) => process.exit(), 1000)
  }
}

process.once('SIGINT', stopPiBot('SIGINT'))

process.once('SIGTERM', stopPiBot('SIGTERM'))

process.on("beforeExit", stopPiBot('beforeExit'))

startPiBot()
