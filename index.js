const fs = require('fs');
const path = require('path');

const {
    Client,
    Collection,
    GatewayIntentBits
} = require('discord.js');

require('dotenv').config();

/* =========================
   CREATE DISCORD CLIENT
========================= */

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

client.commands = new Collection();

/* =========================
   LOAD COMMAND FILES
========================= */

const commandsPath = path.join(__dirname, 'commands');

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
            entry.name.endsWith('.js')
        ) {
            files.push(fullPath);
        }
    }

    return files;
}

if (fs.existsSync(commandsPath)) {
    const commandFiles = getCommandFiles(commandsPath);

    for (const filePath of commandFiles) {
        try {
            const command = require(filePath);

            if (!command.data || !command.execute) {
                console.warn(
                    `⚠️ Invalid command file: ${filePath}`
                );
                continue;
            }

            const commandName = command.data.name;

            if (client.commands.has(commandName)) {
                console.warn(
                    `⚠️ Duplicate command detected: ${commandName}`
                );
                continue;
            }

            client.commands.set(commandName, command);

            console.log(
                `✅ Loaded command: ${commandName}`
            );
        } catch (error) {
            console.error(
                `❌ Failed to load command: ${filePath}`
            );

            console.error(error);
        }
    }
} else {
    console.warn(
        `⚠️ Commands directory does not exist: ${commandsPath}`
    );
}

/* =========================
   BOT READY
========================= */

client.once('ready', () => {
    console.log('');
    console.log('=================================');
    console.log(`🤖 Logged in as ${client.user.tag}`);
    console.log(`🆔 Bot ID: ${client.user.id}`);
    console.log(`🏠 Servers: ${client.guilds.cache.size}`);
    console.log(`📦 Commands: ${client.commands.size}`);
    console.log('=================================');
    console.log('');
});

/* =========================
   INTERACTION HANDLER
========================= */

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) {
        return;
    }

    const command = client.commands.get(
        interaction.commandName
    );

    if (!command) {
        console.warn(
            `⚠️ Unknown command: ${interaction.commandName}`
        );

        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '❌ I could not find that command.',
                ephemeral: true
            });
        }

        return;
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(
            `❌ Error executing /${interaction.commandName}:`
        );

        console.error(error);

        const errorMessage = {
            content:
                '❌ Something went wrong while executing that command.',
            ephemeral: true
        };

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        } catch (replyError) {
            console.error(
                '❌ Could not send error message:',
                replyError
            );
        }
    }
});

/* =========================
   DISCORD CLIENT ERRORS
========================= */

client.on('error', error => {
    console.error('❌ Discord client error:', error);
});

client.on('warn', warning => {
    console.warn('⚠️ Discord warning:', warning);
});

/* =========================
   LOGIN
========================= */

if (!process.env.DISCORD_TOKEN) {
    console.error(
        '❌ DISCORD_TOKEN is missing from your .env file.'
    );

    process.exit(1);
}

client.login(process.env.DISCORD_TOKEN)
    .then(() => {
        console.log('🔌 Connecting to Discord...');
    })
    .catch(error => {
        console.error(
            '❌ Failed to login to Discord:'
        );

        console.error(error);

        process.exit(1);
    });