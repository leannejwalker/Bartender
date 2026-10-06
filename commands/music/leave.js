const {
    SlashCommandBuilder
} = require("discord.js");

const musicManager =
    require("../../music/MusicManager");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("leave")
        .setDescription(
            "Leave the voice channel"
        ),

    async execute(interaction) {
        musicManager.leave(
            interaction.guild.id
        );

        await interaction.reply(
            "👋 Left the voice channel."
        );
    }
};