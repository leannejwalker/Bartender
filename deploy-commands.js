require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const {
    REST,
    Routes
} = require("discord.js");

const commands = [];
const commandsPath = path.join(__dirname, "commands");

/* =========================
   FIND COMMANDS RECURSIVELY
========================= */

function getCommandFiles(dir) {
    const entries = fs.readdirSync(dir, {
        withFileTypes: true
    });

    let files = [];

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            files = files.concat(
                getCommandFiles(fullPath)
            );
        } else if (
            entry.isFile() &&
            entry.name.endsWith(".js")
        ) {
            files.push(fullPath);
        }
    }

    return files;
}

/* =========================
   LOAD COMMANDS
========================= */

const commandFiles = getCommandFiles(commandsPath);

for (const filePath of commandFiles) {
    try {
        const command = require(filePath);

        if (!command.data || !command.execute) {
            console.warn(
                `⚠️ Skipping invalid command: ${filePath}`
            );
            continue;
        }

        commands.push(command.data.toJSON());

        console.log(
            `📦 Found command: /${command.data.name}`
        );
    } catch (error) {
        console.error(
            `❌ Failed loading command: ${filePath}`
        );

        console.error(error);
    }
}

/* =========================
   DEPLOY
========================= */

const rest = new REST({
    version: "10"
}).setToken(process.env.DISCORD_TOKEN);

async function deployCommands() {
    try {
        console.log("");
        console.log(
            `🚀 Deploying ${commands.length} command(s)...`
        );

        await rest.put(
            Routes.applicationGuildCommands(
                process.env.CLIENT_ID,
                process.env.GUILD_ID
            ),
            {
                body: commands
            }
        );

        console.log("");
        console.log(
            `✅ Successfully deployed ${commands.length} command(s)!`
        );
        console.log("");
    } catch (error) {
        console.error("");
        console.error("❌ Failed to deploy commands:");
        console.error(error);
        console.error("");
    }
}

deployCommands();
