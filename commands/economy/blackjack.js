const crypto = require("node:crypto");

const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    MessageFlags
} = require("discord.js");

const economy = require(
    "../../dependencies/EconomyManager"
);

/*
 * GAME CONFIGURATION
 */

const MINIMUM_BET = 1;
const MAXIMUM_BET = 10000;
const GAME_TIMEOUT_MS = 2 * 60 * 1000;

/*
 * CARD AND DECK FUNCTIONS
 */

const suits = [
    {
        symbol: "♠",
        name: "Spades"
    },
    {
        symbol: "♥",
        name: "Hearts"
    },
    {
        symbol: "♦",
        name: "Diamonds"
    },
    {
        symbol: "♣",
        name: "Clubs"
    }
];

const ranks = [
    {
        name: "A",
        value: 11
    },
    {
        name: "2",
        value: 2
    },
    {
        name: "3",
        value: 3
    },
    {
        name: "4",
        value: 4
    },
    {
        name: "5",
        value: 5
    },
    {
        name: "6",
        value: 6
    },
    {
        name: "7",
        value: 7
    },
    {
        name: "8",
        value: 8
    },
    {
        name: "9",
        value: 9
    },
    {
        name: "10",
        value: 10
    },
    {
        name: "J",
        value: 10
    },
    {
        name: "Q",
        value: 10
    },
    {
        name: "K",
        value: 10
    }
];

function createDeck() {
    const deck = [];

    for (const suit of suits) {
        for (const rank of ranks) {
            deck.push({
                rank: rank.name,
                suit: suit.symbol,
                suitName: suit.name,
                value: rank.value
            });
        }
    }

    return shuffleDeck(deck);
}

function shuffleDeck(deck) {
    for (
        let index = deck.length - 1;
        index > 0;
        index--
    ) {
        const randomIndex = crypto.randomInt(
            0,
            index + 1
        );

        [
            deck[index],
            deck[randomIndex]
        ] = [
            deck[randomIndex],
            deck[index]
        ];
    }

    return deck;
}

function drawCard(deck) {
    return deck.pop();
}

/*
 * HAND FUNCTIONS
 */

function calculateHandValue(hand) {
    let total = 0;
    let aces = 0;

    for (const card of hand) {
        total += card.value;

        if (card.rank === "A") {
            aces++;
        }
    }

    /*
     * An ace initially counts as 11.
     * Reduce it to 1 when the hand would otherwise bust.
     */

    while (
        total > 21 &&
        aces > 0
    ) {
        total -= 10;
        aces--;
    }

    return total;
}

function isBlackjack(hand) {
    return (
        hand.length === 2 &&
        calculateHandValue(hand) === 21
    );
}

function formatCard(card) {
    return `\`${card.rank}${card.suit}\``;
}

function formatHand(hand) {
    return hand
        .map(formatCard)
        .join(" ");
}

/*
 * BUTTON FUNCTIONS
 */

function createButtons(
    gameId,
    disabled = false
) {
    const hitButton =
        new ButtonBuilder()
            .setCustomId(
                `blackjack_hit_${gameId}`
            )
            .setLabel("Hit")
            .setEmoji("🃏")
            .setStyle(
                ButtonStyle.Primary
            )
            .setDisabled(disabled);

    const standButton =
        new ButtonBuilder()
            .setCustomId(
                `blackjack_stand_${gameId}`
            )
            .setLabel("Stand")
            .setEmoji("✋")
            .setStyle(
                ButtonStyle.Success
            )
            .setDisabled(disabled);

    return new ActionRowBuilder()
        .addComponents(
            hitButton,
            standButton
        );
}

/*
 * EMBED FUNCTIONS
 */

function createGameEmbed({
    username,
    playerHand,
    dealerHand,
    bet,
    hideDealerCard = true,
    message = null,
    colour = 0xd4a017
}) {
    const playerTotal =
        calculateHandValue(
            playerHand
        );

    let dealerCards;
    let dealerTotal;

    if (hideDealerCard) {
        dealerCards =
            `${formatCard(dealerHand[0])} \`??\``;

        dealerTotal = "?";
    } else {
        dealerCards =
            formatHand(dealerHand);

        dealerTotal =
            calculateHandValue(
                dealerHand
            );
    }

    const embed =
        new EmbedBuilder()
            .setColor(colour)
            .setTitle(
                "🃏 Bartender's Blackjack Table"
            )
            .setDescription(
                message ||
                `**${username}** has taken a seat at the table.`
            )
            .addFields(
                {
                    name:
                        `🍺 ${username}'s hand`,
                    value:
                        `${formatHand(playerHand)}\n` +
                        `**Total: ${playerTotal}**`,
                    inline: false
                },
                {
                    name:
                        "🎩 Bartender's hand",
                    value:
                        `${dealerCards}\n` +
                        `**Total: ${dealerTotal}**`,
                    inline: false
                },
                {
                    name: "💰 Wager",
                    value:
                        `**${economy.formatBucks(bet)} BB**`,
                    inline: true
                }
            )
            .setFooter({
                text:
                    hideDealerCard
                        ? "Choose Hit or Stand"
                        : "The hand is complete"
            })
            .setTimestamp();

    return embed;
}

/*
 * DEALER TURN
 */

function playDealerTurn(
    dealerHand,
    deck
) {
    while (
        calculateHandValue(
            dealerHand
        ) < 17
    ) {
        dealerHand.push(
            drawCard(deck)
        );
    }
}

/*
 * COMMAND
 */

module.exports = {
    data: new SlashCommandBuilder()
        .setName("blackjack")
        .setDescription(
            "Play a public game of blackjack using Bartender Bucks."
        )
        .addIntegerOption(option =>
            option
                .setName("bet")
                .setDescription(
                    "The number of Bartender Bucks to wager."
                )
                .setMinValue(
                    MINIMUM_BET
                )
                .setMaxValue(
                    MAXIMUM_BET
                )
                .setRequired(true)
        ),

    async execute(interaction) {
        const bet =
            interaction.options.getInteger(
                "bet",
                true
            );

        const userId =
            interaction.user.id;

        const username =
            interaction.user.displayName;

        /*
         * Take the wager before dealing.
         */

        const deduction =
            economy.removeBalance(
                userId,
                bet,
                interaction.user.username
            );

        if (!deduction.success) {
            await interaction.reply({
                content:
                    `🍺 I'm afraid your tab won't stretch to a wager of **${economy.formatBucks(bet)} BB**.\n\n` +
                    `Your current balance is **${economy.formatBucks(deduction.balance)} BB**.`,
                flags:
                    MessageFlags.Ephemeral
            });

            return;
        }

        /*
         * Create and deal the deck.
         */

        const deck = createDeck();

        const playerHand = [
            drawCard(deck),
            drawCard(deck)
        ];

        const dealerHand = [
            drawCard(deck),
            drawCard(deck)
        ];

        const gameId =
            `${userId}_${Date.now()}`;

        let gameFinished = false;

        /*
         * Initial natural-blackjack checks.
         */

        const playerBlackjack =
            isBlackjack(
                playerHand
            );

        const dealerBlackjack =
            isBlackjack(
                dealerHand
            );

        if (
            playerBlackjack ||
            dealerBlackjack
        ) {
            let resultMessage;
            let colour;
            let payout = 0;

            if (
                playerBlackjack &&
                dealerBlackjack
            ) {
                payout = bet;

                economy.addBalance(
                    userId,
                    payout,
                    interaction.user.username
                );

                resultMessage =
                    "🤝 **Push!** Both hands have blackjack. Your wager has been returned.";

                colour = 0xfee75c;
            } else if (playerBlackjack) {
                /*
                 * Total return is 2.5 times the wager.
                 * This includes the original stake.
                 */

                payout = Math.floor(
                    bet * 2.5
                );

                economy.addBalance(
                    userId,
                    payout,
                    interaction.user.username
                );

                resultMessage =
                    `✨ **Natural blackjack!** Bartender pays **${economy.formatBucks(payout)} BB**.`;

                colour = 0x57f287;
            } else {
                resultMessage =
                    `🎩 **Bartender has blackjack.** The house collects the **${economy.formatBucks(bet)} BB** wager.`;

                colour = 0xed4245;
            }

            const balance =
                economy.getBalance(
                    userId,
                    interaction.user.username
                );

            const embed =
                createGameEmbed({
                    username,
                    playerHand,
                    dealerHand,
                    bet,
                    hideDealerCard: false,
                    message:
                        `${resultMessage}\n\n` +
                        `Current balance: **${economy.formatBucks(balance)} BB**`,
                    colour
                });

            await interaction.reply({
                embeds: [embed]
            });

            return;
        }

        /*
         * Start interactive game.
         */

        const startingEmbed =
            createGameEmbed({
                username,
                playerHand,
                dealerHand,
                bet
            });

        await interaction.reply({
            embeds: [
                startingEmbed
            ],
            components: [
                createButtons(
                    gameId
                )
            ]
        });

        const gameMessage =
            await interaction.fetchReply();

        const collector =
            gameMessage.createMessageComponentCollector({
                componentType:
                    ComponentType.Button,
                time:
                    GAME_TIMEOUT_MS,
                filter:
                    buttonInteraction =>
                        buttonInteraction.customId ===
                            `blackjack_hit_${gameId}` ||
                        buttonInteraction.customId ===
                            `blackjack_stand_${gameId}`
            });

        /*
         * Complete the game and update the original message.
         */

        async function completeGame({
            resultMessage,
            colour,
            payout = 0
        }) {
            if (gameFinished) {
                return;
            }

            gameFinished = true;

            if (payout > 0) {
                economy.addBalance(
                    userId,
                    payout,
                    interaction.user.username
                );
            }

            const balance =
                economy.getBalance(
                    userId,
                    interaction.user.username
                );

            const finalEmbed =
                createGameEmbed({
                    username,
                    playerHand,
                    dealerHand,
                    bet,
                    hideDealerCard:
                        false,
                    message:
                        `${resultMessage}\n\n` +
                        `Current balance: **${economy.formatBucks(balance)} BB**`,
                    colour
                });

            await interaction.editReply({
                embeds: [
                    finalEmbed
                ],
                components: [
                    createButtons(
                        gameId,
                        true
                    )
                ]
            });

            collector.stop(
                "game-finished"
            );
        }

        collector.on(
            "collect",
            async buttonInteraction => {
                /*
                 * Stop other members from controlling the hand.
                 */

                if (
                    buttonInteraction.user.id !==
                    userId
                ) {
                    await buttonInteraction.reply({
                        content:
                            "🍺 This isn't your hand. Start your own game with `/blackjack`.",
                        flags:
                            MessageFlags.Ephemeral
                    });

                    return;
                }

                await buttonInteraction.deferUpdate();

                /*
                 * HIT
                 */

                if (
                    buttonInteraction.customId ===
                    `blackjack_hit_${gameId}`
                ) {
                    playerHand.push(
                        drawCard(deck)
                    );

                    const playerTotal =
                        calculateHandValue(
                            playerHand
                        );

                    if (
                        playerTotal > 21
                    ) {
                        await completeGame({
                            resultMessage:
                                `💥 **Bust!** ${username}'s hand went over 21. Bartender collects **${economy.formatBucks(bet)} BB**.`,
                            colour:
                                0xed4245
                        });

                        return;
                    }

                    if (
                        playerTotal === 21
                    ) {
                        playDealerTurn(
                            dealerHand,
                            deck
                        );

                        const dealerTotal =
                            calculateHandValue(
                                dealerHand
                            );

                        if (
                            dealerTotal === 21
                        ) {
                            await completeGame({
                                resultMessage:
                                    "🤝 **Push!** Both hands finished on 21. Your wager has been returned.",
                                colour:
                                    0xfee75c,
                                payout:
                                    bet
                            });
                        } else {
                            await completeGame({
                                resultMessage:
                                    `🍺 **21!** Bartender pays **${economy.formatBucks(bet * 2)} BB**.`,
                                colour:
                                    0x57f287,
                                payout:
                                    bet * 2
                            });
                        }

                        return;
                    }

                    const updatedEmbed =
                        createGameEmbed({
                            username,
                            playerHand,
                            dealerHand,
                            bet,
                            message:
                                `**${username}** takes another card.`
                        });

                    await interaction.editReply({
                        embeds: [
                            updatedEmbed
                        ],
                        components: [
                            createButtons(
                                gameId
                            )
                        ]
                    });

                    return;
                }

                /*
                 * STAND
                 */

                if (
                    buttonInteraction.customId ===
                    `blackjack_stand_${gameId}`
                ) {
                    playDealerTurn(
                        dealerHand,
                        deck
                    );

                    const playerTotal =
                        calculateHandValue(
                            playerHand
                        );

                    const dealerTotal =
                        calculateHandValue(
                            dealerHand
                        );

                    if (
                        dealerTotal > 21
                    ) {
                        await completeGame({
                            resultMessage:
                                `🎩 **Bartender busts!** ${username} wins **${economy.formatBucks(bet * 2)} BB**.`,
                            colour:
                                0x57f287,
                            payout:
                                bet * 2
                        });

                        return;
                    }

                    if (
                        playerTotal >
                        dealerTotal
                    ) {
                        await completeGame({
                            resultMessage:
                                `🍺 **${username} wins!** Bartender pays **${economy.formatBucks(bet * 2)} BB**.`,
                            colour:
                                0x57f287,
                            payout:
                                bet * 2
                        });

                        return;
                    }

                    if (
                        playerTotal ===
                        dealerTotal
                    ) {
                        await completeGame({
                            resultMessage:
                                "🤝 **Push!** The wager has been returned.",
                            colour:
                                0xfee75c,
                            payout:
                                bet
                        });

                        return;
                    }

                    await completeGame({
                        resultMessage:
                            `🎩 **Bartender wins.** The house collects the **${economy.formatBucks(bet)} BB** wager.`,
                        colour:
                            0xed4245
                    });
                }
            }
        );

        /*
         * Timeout handling.
         */

        collector.on(
            "end",
            async (
                collected,
                reason
            ) => {
                if (
                    gameFinished ||
                    reason ===
                        "game-finished"
                ) {
                    return;
                }

                gameFinished = true;

                /*
                 * Return the wager because the game did not finish.
                 */

                economy.addBalance(
                    userId,
                    bet,
                    interaction.user.username
                );

                const balance =
                    economy.getBalance(
                        userId,
                        interaction.user.username
                    );

                const timeoutEmbed =
                    createGameEmbed({
                        username,
                        playerHand,
                        dealerHand,
                        bet,
                        hideDealerCard:
                            false,
                        message:
                            "⌛ **The table closed because no choice was made.**\n\n" +
                            `Your **${economy.formatBucks(bet)} BB** wager has been returned.\n\n` +
                            `Current balance: **${economy.formatBucks(balance)} BB**`,
                        colour:
                            0x747f8d
                    });

                try {
                    await interaction.editReply({
                        embeds: [
                            timeoutEmbed
                        ],
                        components: [
                            createButtons(
                                gameId,
                                true
                            )
                        ]
                    });
                } catch (error) {
                    console.error(
                        "[Blackjack] Could not close expired game:",
                        error
                    );
                }
            }
        );
    }
};