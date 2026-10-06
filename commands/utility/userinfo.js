const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("userinfo")
        .setDescription("View information about a server member")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("The member to look up")
                .setRequired(false)
        ),

    async execute(interaction) {
        const user =
            interaction.options.getUser("user") || interaction.user;

        const member = await interaction.guild.members.fetch(user.id);

        const accountCreated = Math.floor(
            user.createdTimestamp / 1000
        );

        const joinedServer = Math.floor(
            member.joinedTimestamp / 1000
        );

        const roles = member.roles.cache
            .filter(role => role.id !== interaction.guild.id)
            .sort((a, b) => b.position - a.position)
            .map(role => role.toString())
            .slice(0, 10);

        const roleText =
            roles.length > 0
                ? roles.join(" ")
                : "No roles";

        const embed = new EmbedBuilder()
            .setColor(member.displayColor || 0x5865F2)
            .setAuthor({
                name: `${user.username}'s Profile`,
                iconURL: user.displayAvatarURL()
            })
            .setThumbnail(user.displayAvatarURL({
                size: 256
            }))
            .addFields(
                {
                    name: "👤 User",
                    value: `<@${user.id}>\n\`${user.username}\``,
                    inline: true
                },
                {
                    name: "🆔 User ID",
                    value: `\`${user.id}\``,
                    inline: true
                },
                {
                    name: "🤖 Bot",
                    value: user.bot ? "Yes" : "No",
                    inline: true
                },
                {
                    name: "📅 Account Created",
                    value: `<t:${accountCreated}:D>\n<t:${accountCreated}:R>`,
                    inline: true
                },
                {
                    name: "🏠 Joined After Hours",
                    value: `<t:${joinedServer}:D>\n<t:${joinedServer}:R>`,
                    inline: true
                },
                {
                    name: "🏷️ Roles",
                    value: roleText,
                    inline: false
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
