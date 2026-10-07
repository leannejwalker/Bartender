const { SlashCommandBuilder } = require("discord.js");
const musicManager = require("../../music/MusicManager");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("join")
        .setDescription("Join your current voice channel"),

    async execute(interaction) {
        const voiceChannel =
            interaction.member?.voice?.channel;

        if (!voiceChannel) {
            return interaction.reply({
                content:
                    "❌ You need to be in a voice channel first.",
                ephemeral: true
            });
        }

        try {
            musicManager.connect(
                interaction.guildId,
                voiceChannel
            );

            musicManager.setTextChannel(
                interaction.guildId,
                interaction.channel
            );

            await interaction.reply(
                `🔊 Joined **${voiceChannel.name}**.`
            );
        } catch (error) {
            console.error(
                "[Music] Join command error:",
                error
            );

            await interaction.reply({
                content:
                    `❌ Could not join the voice channel: ${
                        error?.message || error
                    }`,
                ephemeral: true
            });
        }
    }
};