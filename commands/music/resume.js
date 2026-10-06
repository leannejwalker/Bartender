const {
    SlashCommandBuilder
} = require("discord.js");

const MusicManager = require("../../music/MusicManager");

module.exports = {
    category: "Music",

    data: new SlashCommandBuilder()
        .setName("resume")
        .setDescription("Resume the current song"),

    async execute(interaction) {
        const manager =
            MusicManager.get(
                interaction.guild.id
            );

        manager.resume();

        await interaction.reply(
            "▶️ Playback resumed."
        );
    }
};