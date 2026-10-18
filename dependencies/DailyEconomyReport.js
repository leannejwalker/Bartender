const fs = require("fs");
const path = require("path");
const {
    EmbedBuilder
} = require("discord.js");

const economy = require(
    "./EconomyManager"
);

const REPORT_FILE = path.join(
    __dirname,
    "../database/economy-report.json"
);

function loadReportData() {
    try {
        if (
            !fs.existsSync(REPORT_FILE)
        ) {
            return {
                previousTotalMoney: 0,
                lastReportDate: null
            };
        }

        return JSON.parse(
            fs.readFileSync(
                REPORT_FILE,
                "utf8"
            )
        );
    } catch {
        return {
            previousTotalMoney: 0,
            lastReportDate: null
        };
    }
}

function saveReportData(data) {
    fs.writeFileSync(
        REPORT_FILE,
        JSON.stringify(
            data,
            null,
            2
        )
    );
}

async function sendDailyReport(
    client
) {
    const channelId =
        process.env
            .ECONOMY_REPORT_CHANNEL_ID;

    if (!channelId) {
        return;
    }

    const channel =
        await client.channels.fetch(
            channelId
        );

    if (
        !channel ||
        !channel.isTextBased()
    ) {
        return;
    }

    const report =
        economy.getEconomyReport();

    const previous =
        loadReportData();

    let inflation = 0;

    if (
        previous.previousTotalMoney >
        0
    ) {
        inflation =
            (
                ((report.totalMoney -
                    previous.previousTotalMoney) /
                    previous.previousTotalMoney) *
                100
            ).toFixed(2);
    }

    const rankings =
        report.richestUsers
            .map(
                (
                    user,
                    index
                ) =>
                    `${index + 1}. ${
                        user.username
                    } — ${economy.formatBucks(user.balance)} BB`
            )
            .join("\n");

    const embed =
        new EmbedBuilder()
            .setColor(
                inflation >= 0
                    ? 0x57f287
                    : 0xed4245
            )
            .setTitle(
                "🍺 Daily Bartender Bucks Economic Report"
            )
            .setDescription(
                [
                    `📈 Inflation: **${inflation}%**`,
                    `💰 Money in circulation: **${economy.formatBucks(report.totalMoney)} BB**`,
                    `👥 Active accounts: **${report.activeUsers}**`,
                    `📊 Average balance: **${economy.formatBucks(report.averageBalance)} BB**`,
                    "",
                    "🏆 Top 5 Richest Customers",
                    rankings
                ].join("\n")
            )
            .setTimestamp();

    await channel.send({
        embeds: [embed]
    });

    saveReportData({
        previousTotalMoney:
            report.totalMoney,
        lastReportDate:
            new Date()
                .toISOString()
                .split("T")[0]
    });
}

function startDailyEconomyReport(
    client
) {
    setInterval(
        async () => {
            const today =
                new Date()
                    .toISOString()
                    .split("T")[0];

            const data =
                loadReportData();

            if (
                data.lastReportDate ===
                today
            ) {
                return;
            }

            const hour =
                new Date().getHours();

            if (hour === 18) {
                await sendDailyReport(
                    client
                );
            }
        },
        60 * 1000
    );
}

module.exports = {
    startDailyEconomyReport
};