const { SlashCommandBuilder } = require("discord.js");
const musicManager = require("../../music/MusicManager");
module.exports = {
    data: new SlashCommandBuilder().setName("clear").setDescription("Clear the waiting music queue"),
    async execute(interaction) {
        const count = musicManager.clearQueue(interaction.guildId);
        return interaction.reply(`Cleared ${count} queued track${count === 1 ? "" : "s"}.`);
    }
};
