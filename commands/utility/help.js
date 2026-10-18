const {
    SlashCommandBuilder,
    EmbedBuilder,
    MessageFlags
} = require("discord.js");

const CATEGORY_DETAILS = {
    Economy: {
        icon: "💰",
        description: "Bartender Bucks, rewards and wagers"
    },
    Music: {
        icon: "🎵",
        description: "Playback and queue controls"
    },
    Utility: {
        icon: "🛠️",
        description: "Server information and useful tools"
    },
    Other: {
        icon: "📖",
        description: "More commands from Bartender"
    }
};

const CATEGORY_ORDER = [
    "Economy",
    "Music",
    "Utility",
    "Other"
];

function findCommandCategory(command) {
    const cachedModule = Object.values(require.cache).find(
        module => module.exports === command
    );

    if (!cachedModule?.filename) {
        return "Other";
    }

    const path = require("node:path");
    const parts = cachedModule.filename.split(path.sep);
    const commandsIndex = parts.lastIndexOf("commands");

    if (
        commandsIndex === -1 ||
        parts.length <= commandsIndex + 2
    ) {
        return "Other";
    }

    const folderName = parts[commandsIndex + 1];

    return (
        folderName.charAt(0).toUpperCase() +
        folderName.slice(1)
    );
}

function splitCommandList(commands, maxLength = 1000) {
    const chunks = [];
    let currentChunk = "";

    for (const command of commands) {
        const entry =
            `📄 \`/${command.name}\`\n` +
            `└ ${command.description}\n\n`;

        if (
            currentChunk.length > 0 &&
            currentChunk.length + entry.length > maxLength
        ) {
            chunks.push(currentChunk.trimEnd());
            currentChunk = "";
        }

        currentChunk += entry;
    }

    if (currentChunk.length > 0) {
        chunks.push(currentChunk.trimEnd());
    }

    return chunks;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("Show all available Bartender commands"),

    async execute(interaction) {
        const categories = new Map();

        for (const command of interaction.client.commands.values()) {
            const name = command.data?.name;

            if (!name) {
                continue;
            }

            const description =
                command.data.description ||
                "No description provided.";

            const category = findCommandCategory(command);

            if (!categories.has(category)) {
                categories.set(category, []);
            }

            categories.get(category).push({
                name,
                description
            });
        }

        const totalCommands = [...categories.values()].reduce(
            (total, categoryCommands) =>
                total + categoryCommands.length,
            0
        );

        const embed = new EmbedBuilder()
            .setColor(0xd4a017)
            .setAuthor({
                name: "Bartender's Command Book",
                iconURL:
                    interaction.client.user.displayAvatarURL()
            })
            .setTitle("🍺 Welcome to the bar")
            .setDescription(
                [
                    "Choose a command from the contents below.",
                    "Bartender updates this list automatically whenever the bot restarts.",
                    "",
                    `📚 **${totalCommands} commands available**`
                ].join("\n")
            )
            .setThumbnail(
                interaction.client.user.displayAvatarURL()
            )
            .setFooter({
                text: "After Hours • Bartender • Private help menu"
            })
            .setTimestamp();

        const sortedCategories = [...categories.entries()].sort(
            ([firstCategory], [secondCategory]) => {
                const firstIndex = CATEGORY_ORDER.indexOf(
                    firstCategory
                );
                const secondIndex = CATEGORY_ORDER.indexOf(
                    secondCategory
                );

                const safeFirstIndex =
                    firstIndex === -1
                        ? CATEGORY_ORDER.length
                        : firstIndex;
                const safeSecondIndex =
                    secondIndex === -1
                        ? CATEGORY_ORDER.length
                        : secondIndex;

                if (safeFirstIndex !== safeSecondIndex) {
                    return safeFirstIndex - safeSecondIndex;
                }

                return firstCategory.localeCompare(secondCategory);
            }
        );

        for (const [category, categoryCommands] of sortedCategories) {
            categoryCommands.sort((first, second) =>
                first.name.localeCompare(second.name)
            );

            const details = CATEGORY_DETAILS[category] || {
                icon: "📖",
                description: "Additional Bartender commands"
            };

            const chunks = splitCommandList(categoryCommands);

            chunks.forEach((chunk, index) => {
                const continuation =
                    index === 0 ? "" : " continued";

                embed.addFields({
                    name:
                        `${details.icon} ${category}${continuation}` +
                        (index === 0
                            ? ` • ${details.description}`
                            : ""),
                    value: chunk,
                    inline: false
                });
            });
        }

        await interaction.reply({
            embeds: [embed],
        });
    }
};
