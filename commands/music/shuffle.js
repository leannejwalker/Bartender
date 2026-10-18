const { SlashCommandBuilder } = require("discord.js");
const musicManager = require("../../music/MusicManager");
module.exports = {
    data: new SlashCommandBuilder().setName("shuffle").setDescription("Shuffle the waiting music queue"),
    async execute(interaction) {
        const queue = musicManager.shuffle(interaction.guildId);
        return interaction.reply(queue.length > 1 ? "Queue shuffled." : "Not enough queued tracks to shuffle.");
    }
};
