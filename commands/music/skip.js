const { SlashCommandBuilder } = require("discord.js");
const musicManager = require("../../dependencies/MusicManager");
module.exports = {
    data: new SlashCommandBuilder().setName("skip").setDescription("Skip the current track"),
    async execute(interaction) {
        const success = musicManager.skip(interaction.guildId);
        return interaction.reply(success ? "Skipped." : "Nothing is currently playing.");
    }
};
