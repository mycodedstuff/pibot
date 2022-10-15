# <image src="./assets/logo.jpg" width=24> PiBot

[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](http://www.typescriptlang.org/)
[![MPL-2.0 license](https://img.shields.io/badge/license-MPL--2.0-blue.svg)](https://github.com/mycodedstuff/mExport/blob/master/LICENSE)
![Version](https://img.shields.io/badge/version-v1.0.0-blue)
[![CodeQL](https://github.com/mycodedstuff/pibot/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/mycodedstuff/pibot/actions/workflows/codeql-analysis.yml)
![Node Version](https://img.shields.io/badge/Node-v12.22.10-brightgreen)
![Last Commit](https://img.shields.io/github/last-commit/mycodedstuff/pibot)
### This project starts a telegram bot which can be used to download any telegram media sent/forwarded to it.

## What can it do?
* It can download any document/video forwarded to the bot
* It will download the media to the configured directory with sub directories as channel/user title/name
* Show all downloads (active and downloaded)

## Why PiBot?
I run this bot on a Raspberry Pi 4B, hence the name `PiBot`

## How do I use it?
I've setup this as a startup script on my Raspberry Pi 4B (with an external 1TB HDD) and have setup [Plex Media Server](https://www.plex.tv/media-server-downloads/) on it. [Guide for Raspberry Pi](https://pimylifeup.com/raspberry-pi-plex-server/)

This allows me to send any telegram media to the bot and once downloaded I can stream it to any device I want. Plex will automatically organize the contents once you've setup the download directory as a library.

## Why has it implemented a telegram client?
Thing is as of writing this document Telegram allows bots to download anything up to `20MB` in size which is pretty low for most of the media you will use it for. Hence logging in with your telegram credentials helps in downloading the huge media files.

## Prerequisites
* Create a bot using [@BotFather](https://t.me/botfather) on telegram and get bot token, here is a [guide](https://core.telegram.org/bots#6-botfather) to help you out
* Goto https://my.telegram.org and get api_id and api_hash. [Guide for reference](https://core.telegram.org/api/obtaining_api_id)
* Setup `Node v12` on the system you will use it on (I recommend using [nvm](https://github.com/nvm-sh/nvm))

## Steps to configure PiBot
I would recommend using the test credentials first to test things out. Once things are working then you can use your actual credentials. Jump to [How to test it](#how-to-test-it) section below
```shell
# Use git to clone the project
git clone https://github.com/mycodedstuff/pibot.git

# Goto pibot directory
cd pibot

# Install dependencies
npm i

# Setup mandatory envs
# Setup bot token
export TG_BOT_TOKEN="XXXXX"

# Credentials for telegram client
export USER_PHONE_NUMBER="+919876543210"
export USER_PASSWORD="xxxx"

# Telegram API Configuration
export TG_API_ID="00000"
export TG_API_HASH="dummy_hash"

# Optional envs
# Use the below to configure a specific telegram data center
export TG_SERVER_IP="XXX.XXX.XXX.XXX"
export TG_SERVER_PORT="443"
export TG_DC_ID="1"

# Use the below if port 9001 is already being used on your system
export CODE_SEVER_PORT="9001"

# Use the below to change how you provide the 2FA code when logging into the client
export CODE_INPUT_MODE="WEB" # WEB or CLI (default is CLI)

# Use the below to specify the main download directory
export DOWNLOAD_DIR="../downloads"
```

## How to start
```shell
# We can use npm to start
# Make sure all the env's are configured correctly
npm start
```

## How to use
1. Once the bot server has started open telegram
2. Open your bot and do `/start` or click the start button if bot is configured correctly it will respond
    * You can use `/help` to know all the commands
3. Now to connect/login the client run `/connect`
    * If you've 2FA configured then the bot will ask you to provide the code using one of the two method configured using `CODE_INPUT_MODE`
      1. `CLI`: In the shell where you started the bot it will prompt for code
      2. `WEB`: The bot will use start a web server on port configured via `CODE_SERVER_PORT` (default is 9001) and use [ngrok](https://ngrok.com/) to create a temporarily public link and the bot will send it to you.
      
          You need to send the code to the provided url. I used [HTTP Shortcuts](https://http-shortcuts.rmy.ch/) app on Android to take url and code as input and automatically initiate a HTTP POST request. You can import the one I've made [http_shortcuts.zip](./assets/http_shortcut.zip)
          
          Here is a curl example for this:
          Here NGROK_LINK is the ngrok link given by bot and 2FA_CODE is the code sent by telegram
          ```shell
          curl --location --request POST '<NGROK_LINK>' --form 'code="<2FA_CODE>"'
          ```
4. Once client is connected bot will send a confirmation message, after this you can begin sending any document/video to the bot too automatically download it.

## Not working as expected?
Please raise an issue
Also the application logs errors and returns certain exit codes for certain issues. Check [EXIT_CODES.md](./EXIT_CODES.md)

## Security concerns
As you're going to put your telegram credentials as env I would recommend enabling 2FA if not already and make sure the system is secure on which you're setting it. As of now that's the only way 

I can setup the same approach for password as I've done for 2FA code but then that will involve an extra HTTP call.

### Can't we send the 2FA code using the telegram bot?
Telegram actually detects if you send the 2FA code to anyone via telegram it will expire the code immediately hence this method won't work. (There is an option to send it by reversing the number which does work, but I want to respect the choice of Telegram team)

### Just because something is open source don't trust them blindly
As this project is relatively small you can easily go through it to validate it. I don't intend to use this project to collect credentials or any data from people who might be using it. Though I would love hear a feedback on this project.

## How to test it
Telegram allows login via test credentials for client login, follow this guide https://core.telegram.org/api/auth#test-accounts

Note: In order for this to work you will have to change the telegram data center configuration to the test data center. The values are available on the same page from where you got api_id and api_hash.

Also you won't be able to download things when using the test credentials as the test servers won't have access to production data.
