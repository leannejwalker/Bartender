const {
    SlashCommandBuilder
} = require("discord.js");

const MusicManager = require("../../music/MusicManager");

module.exports = {
    category: "Music",

    data: new SlashCommandBuilder()
        .setName("skip")
        .setDescription("Skip the current song"),

    async execute(interaction) {
        const manager =
            MusicManager.get(
                interaction.guild.id
            );

        if (!manager.current) {
            return interaction.reply({
                content: "❌ Nothing is playing.",
                ephemeral: true
            });
        }

        const skipped =
            manager.current.title;

        manager.skip();

        await interaction.reply(
            `⏭️ Skipped **${skipped}**.`
        );
    }
};