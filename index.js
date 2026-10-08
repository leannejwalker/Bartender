const fs = require("fs");
const path = require("path");

const {
    Client,
    Collection,
    GatewayIntentBits
} = require("discord.js");

require("dotenv").config();

const statsManager = require("./database/StatsManager");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

client.commands = new Collection();

const commandsPath = path.join(__dirname, "commands");

function getCommandFiles(dir) {
    const entries = fs.readdirSync(dir, {
        withFileTypes: true
    });

    let files = [];

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            files.push(...getCommandFiles(fullPath));
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
            console.warn(
                `⚠️ Invalid command file: ${filePath}`
            );
            continue;
        }

        client.commands.set(
            command.data.name,
            command
        );

        console.log(
            `📦 Loaded /${command.data.name}`
        );
    } catch (error) {
        console.error(
            `❌ Failed to load: ${filePath}`
        );
        console.error(error);
    }
}

client.once("ready", () => {
    console.log(
        `🍺 Bartender online as ${client.user.tag}`
    );

    console.log(
        "📊 Statistics database connected."
    );
});

client.on("messageCreate", message => {
    try {
        statsManager.recordMessage(message);
    } catch (error) {
        console.error(
            "[Stats] Message tracking error:",
            error
        );
    }
});

client.on("guildMemberAdd", member => {
    try {
        statsManager.recordMemberJoin(member);
    } catch (error) {
        console.error(
            "[Stats] Member join tracking error:",
            error
        );
    }
});

client.on("guildMemberRemove", member => {
    try {
        statsManager.recordMemberLeave(member);
    } catch (error) {
        console.error(
            "[Stats] Member leave tracking error:",
            error
        );
    }
});

client.on(
    "interactionCreate",
    async interaction => {
        /*
         * MUSIC BUTTONS
         */
        if (interaction.isButton()) {
            const musicManager = require(
                "./music/MusicManager"
            );

            const guildId =
                interaction.guild.id;

            try {
                switch (
                    interaction.customId
                ) {
                    case "music_pause":
                        musicManager.pause(
                            guildId
                        );

                        await interaction.reply({
                            content:
                                "⏸️ Paused.",
                            ephemeral:
                                true
                        });
                        break;

                    case "music_resume":
                        musicManager.resume(
                            guildId
                        );

                        await interaction.reply({
                            content:
                                "▶️ Resumed.",
                            ephemeral:
                                true
                        });
                        break;

                    case "music_skip":
                        await musicManager.skip(
                            guildId
                        );

                        await interaction.reply({
                            content:
                                "⏭️ Skipped.",
                            ephemeral:
                                true
                        });
                        break;

                    case "music_loop": {
                        const enabled =
                            musicManager.toggleLoop(
                                guildId
                            );

                        await interaction.reply({
                            content: enabled
                                ? "🔁 Loop enabled."
                                : "➡️ Loop disabled.",
                            ephemeral:
                                true
                        });

                        break;
                    }

                    case "music_stop":
                        musicManager.stop(
                            guildId
                        );

                        await interaction.reply({
                            content:
                                "🛑 Music stopped.",
                            ephemeral:
                                true
                        });
                        break;
                }
            } catch (error) {
                console.error(
                    "Button error:",
                    error
                );

                if (
                    !interaction.replied &&
                    !interaction.deferred
                ) {
                    await interaction.reply({
                        content:
                            "❌ Something went wrong.",
                        ephemeral:
                            true
                    });
                }
            }

            return;
        }

        /*
         * SLASH COMMANDS
         */
        if (
            !interaction.isChatInputCommand()
        ) {
            return;
        }

        try {
            statsManager.recordCommand(
                interaction
            );
        } catch (error) {
            console.error(
                "[Stats] Command tracking error:",
                error
            );
        }

        const command =
            client.commands.get(
                interaction.commandName
            );

        if (!command) {
            console.warn(
                `⚠️ Unknown command: ${interaction.commandName}`
            );

            return;
        }

        try {
            await command.execute(
                interaction
            );
        } catch (error) {
            console.error(
                `❌ Error executing /${interaction.commandName}:`,
                error
            );

            const response = {
                content:
                    "❌ There was an error while executing that command.",
                ephemeral: true
            };

            if (
                interaction.replied ||
                interaction.deferred
            ) {
                await interaction.followUp(
                    response
                );
            } else {
                await interaction.reply(
                    response
                );
            }
        }
    }
);

client.on("error", error => {
    console.error(
        "Discord client error:",
        error
    );
});

process.on(
    "unhandledRejection",
    error => {
        console.error(
            "Unhandled promise rejection:",
            error
        );
    }
);

process.on(
    "uncaughtException",
    error => {
        console.error(
            "Uncaught exception:",
            error
        );
    }
);

if (!process.env.DISCORD_TOKEN) {
    console.error(
        "❌ DISCORD_TOKEN is missing from .env"
    );

    process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);