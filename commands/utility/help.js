const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("Show all available Bartender commands"),

    async execute(interaction) {
        const commands = interaction.client.commands;

        const categories = new Map();

        for (const command of commands.values()) {
            const name = command.data.name;
            const description =
                command.data.description ||
                "No description provided.";

            // Find the command's folder/category
            let category = "Other";

            if (command.data.name) {
                const commandPath =
                    require.resolve(
                        Object.values(require.cache)
                            .find(module =>
                                module.exports === command
                            )?.filename || ""
                    );

                if (commandPath) {
                    const parts = commandPath.split(
                        require("node:path").sep
                    );

                    const commandsIndex =
                        parts.lastIndexOf("commands");

                    if (
                        commandsIndex !== -1 &&
                        parts.length > commandsIndex + 2
                    ) {
                        category =
                            parts[commandsIndex + 1];
                    }
                }
            }

            category =
                category.charAt(0).toUpperCase() +
                category.slice(1);

            if (!categories.has(category)) {
                categories.set(category, []);
            }

            categories.get(category).push({
                name,
                description
            });
        }

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setAuthor({
                name: "Bartender • Help",
                iconURL:
                    interaction.client.user.displayAvatarURL()
            })
            .setDescription(
                "🍻 **Welcome to Bartender!**\n\n" +
                "Here are all the commands currently available."
            )
            .setFooter({
                text: "After Hours • Bartender"
            })
            .setTimestamp();

        // Sort categories alphabetically
        const sortedCategories = [...categories.entries()]
            .sort(([a], [b]) =>
                a.localeCompare(b)
            );

        for (const [category, categoryCommands] of sortedCategories) {
            categoryCommands.sort((a, b) =>
                a.name.localeCompare(b.name)
            );

            const commandText = categoryCommands
                .map(command =>
                    `**/${command.name}** — ${command.description}`
                )
                .join("\n");

            embed.addFields({
                name: `📂 ${category}`,
                value: commandText,
                inline: false
            });
        }

        await interaction.reply({
            embeds: [embed]
        });
    }
};