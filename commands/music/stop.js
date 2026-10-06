const {
    SlashCommandBuilder
} = require("discord.js");

const MusicManager = require("../../music/MusicManager");

module.exports = {
    category: "Music",

    data: new SlashCommandBuilder()
        .setName("stop")
        .setDescription("Stop music and clear the queue"),

    async execute(interaction) {
        const manager =
            MusicManager.get(
                interaction.guild.id
            );

        manager.stop();

        await interaction.reply(
            "⏹️ Music stopped and the queue was cleared."
        );
    }
};