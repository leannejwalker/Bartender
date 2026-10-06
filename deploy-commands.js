require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const {
    REST,
    Routes
} = require("discord.js");

const commands = [];
const commandsPath = path.join(__dirname, "commands");

function getCommandFiles(dir) {
    const entries = fs.readdirSync(dir, {
        withFileTypes: true
    });

    let files = [];

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            files = files.concat(getCommandFiles(fullPath));
        } else if (
            entry.isFile() &&
            entry.name.endsWith(".js")
        ) {
            files.push(fullPath);
        }
    }

    return files;
}

const commandFiles = getCommandFiles(commandsPath);

for (const filePath of commandFiles) {
    try {
        const command = require(filePath);

        if (!command.data || !command.execute) {
            console.warn(`⚠️ Invalid command: ${filePath}`);
            continue;
        }

        commands.push(command.data.toJSON());

        console.log(
            `📦 Found command: /${command.data.name}`
        );
    } catch (error) {
        console.error(
            `❌ Failed to load: ${filePath}`
        );

        console.error(error);
    }
}

const rest = new REST({
    version: "10"
}).setToken(process.env.DISCORD_TOKEN);

async function deployCommands() {
    try {
        console.log(
            `\n🚀 Deploying ${commands.length} global command(s)...`
        );

        await rest.put(
            Routes.applicationCommands(
                process.env.CLIENT_ID
            ),
            {
                body: commands
            }
        );

        console.log(
            `✅ Successfully deployed ${commands.length} global command(s)!`
        );
    } catch (error) {
        console.error(
            "❌ Failed to deploy commands:"
        );

        console.error(error);
    }
}

deployCommands();