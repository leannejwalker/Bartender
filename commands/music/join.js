const {
    SlashCommandBuilder
} = require("discord.js");

const musicManager =
    require("../../music/MusicManager");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("join")
        .setDescription(
            "Join your voice channel"
        ),

    async execute(interaction) {
        const voiceChannel =
            interaction.member.voice.channel;

        if (!voiceChannel) {
            return interaction.reply({
                content:
                    "❌ Join a voice channel first.",
                ephemeral: true
            });
        }

        await musicManager.connect(
            interaction.guild,
            voiceChannel
        );

        await interaction.reply(
            `🎧 Joined **${voiceChannel.name}**.`
        );
    }
};