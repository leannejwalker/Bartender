const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("serverinfo")
        .setDescription("View information about the server"),

    async execute(interaction) {
        const guild = interaction.guild;

        // Fetch the guild to make sure we have the latest information
        await guild.fetch();

        const owner = await guild.fetchOwner();

        const createdTimestamp = Math.floor(
            guild.createdTimestamp / 1000
        );

        const memberCount = guild.memberCount;

        const botCount = guild.members.cache.filter(
            member => member.user.bot
        ).size;

        const humanCount = memberCount - botCount;

        const textChannels = guild.channels.cache.filter(
            channel => channel.isTextBased() &&
                !channel.isVoiceBased() &&
                !channel.isThread()
        ).size;

        const voiceChannels = guild.channels.cache.filter(
            channel => channel.isVoiceBased()
        ).size;

        const categories = guild.channels.cache.filter(
            channel => channel.type === 4
        ).size;

        const roleCount = guild.roles.cache.size - 1;

        const emojiCount = guild.emojis.cache.size;

        const boostLevel = guild.premiumTier;

        const boostCount = guild.premiumSubscriptionCount || 0;

        const verificationLevel =
            guild.verificationLevel
                .toString()
                .replace(/_/g, " ")
                .replace(/\b\w/g, char => char.toUpperCase());

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setAuthor({
                name: `${guild.name} • Server Information`,
                iconURL: guild.iconURL({
                    size: 256
                }) || undefined
            })
            .setThumbnail(
                guild.iconURL({
                    size: 512
                })
            )
            .addFields(
                {
                    name: "🏠 Server",
                    value: `\`${guild.name}\``,
                    inline: true
                },
                {
                    name: "🆔 Server ID",
                    value: `\`${guild.id}\``,
                    inline: true
                },
                {
                    name: "👑 Owner",
                    value: `${owner.user}`,
                    inline: true
                },
                {
                    name: "📅 Created",
                    value:
                        `<t:${createdTimestamp}:D>\n` +
                        `<t:${createdTimestamp}:R>`,
                    inline: true
                },
                {
                    name: "👥 Members",
                    value:
                        `**${memberCount}** total\n` +
                        `👤 ${humanCount} humans\n` +
                        `🤖 ${botCount} bots`,
                    inline: true
                },
                {
                    name: "💬 Channels",
                    value:
                        `💬 ${textChannels} text\n` +
                        `🔊 ${voiceChannels} voice\n` +
                        `📁 ${categories} categories`,
                    inline: true
                },
                {
                    name: "🏷️ Roles",
                    value: `\`${roleCount}\``,
                    inline: true
                },
                {
                    name: "😀 Emojis",
                    value: `\`${emojiCount}\``,
                    inline: true
                },
                {
                    name: "🚀 Boosts",
                    value:
                        `Level ${boostLevel}\n` +
                        `${boostCount} boost${boostCount === 1 ? "" : "s"}`,
                    inline: true
                },
                {
                    name: "🔐 Verification",
                    value: verificationLevel,
                    inline: true
                }
            )
            .setFooter({
                text: "After Hours • Bartender"
            })
            .setTimestamp();

        await interaction.reply({
            embeds: [embed]
        });
    }
};