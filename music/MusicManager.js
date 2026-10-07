const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    NoSubscriberBehavior,
    StreamType
} = require("@discordjs/voice");

const { spawn } = require("child_process");

const YTDLP_PATH = "/usr/local/bin/yt-dlp";
const FFMPEG_PATH = "/usr/bin/ffmpeg";
const NODE_PATH =
    "/home/bartenderadmin/.nvm/versions/node/v24.21.0/bin/node";

const YTDLP_COMMON_ARGS = [
    "--js-runtimes",
    `node:${NODE_PATH}`,

    "--no-playlist",
    "--no-warnings"
];

class MusicManager {
    constructor() {
        this.guilds = new Map();
    }

    getGuildData(guildId) {
        if (!this.guilds.has(guildId)) {
            const player = createAudioPlayer({
                behaviors: {
                    noSubscriber: NoSubscriberBehavior.Pause
                }
            });

            const data = {
                queue: [],
                player,
                connection: null,

                current: null,

                volume: 0.8,
                loop: false,

                textChannel: null,
                nowPlayingMessage: null,

                progressInterval: null,
                startedAt: null,

                ytDlpProcess: null,
                ffmpegProcess: null
            };

            player.on(AudioPlayerStatus.Idle, async () => {
                const currentData = this.guilds.get(guildId);

                if (!currentData) {
                    return;
                }

                this.cleanupProcesses(guildId);

                if (currentData.loop && currentData.current) {
                    try {
                        await this.playCurrent(guildId);
                    } catch (error) {
                        console.error(
                            `[Music] Loop playback error in ${guildId}:`,
                            error
                        );
                    }

                    return;
                }

                currentData.current = null;
                currentData.startedAt = null;

                this.stopProgress(guildId);

                if (currentData.queue.length > 0) {
                    try {
                        await this.playNext(guildId);
                    } catch (error) {
                        console.error(
                            `[Music] Next track error in ${guildId}:`,
                            error
                        );
                    }
                }
            });

            player.on("error", error => {
                console.error(
                    `[Music] Audio player error in ${guildId}:`,
                    error
                );

                this.cleanupProcesses(guildId);
                this.stopProgress(guildId);

                const currentData = this.guilds.get(guildId);

                if (!currentData) {
                    return;
                }

                currentData.current = null;
                currentData.startedAt = null;

                if (currentData.queue.length > 0) {
                    this.playNext(guildId).catch(nextError => {
                        console.error(
                            `[Music] Failed to continue queue in ${guildId}:`,
                            nextError
                        );
                    });
                }
            });

            this.guilds.set(guildId, data);
        }

        return this.guilds.get(guildId);
    }

    async connect(guild, voiceChannel) {
        const data = this.getGuildData(guild.id);

        if (
            data.connection &&
            data.connection.joinConfig.channelId === voiceChannel.id
        ) {
            return data;
        }

        if (data.connection) {
            try {
                data.connection.destroy();
            } catch {}
        }

        data.connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: true
        });

        data.connection.subscribe(data.player);

        return data;
    }

    async add(guild, track) {
        const data = this.getGuildData(guild.id);

        data.queue.push(track);

        if (!data.current) {
            await this.playNext(guild.id);
        }

        return data;
    }

    async playNext(guildId) {
        const data = this.guilds.get(guildId);

        if (!data) {
            return;
        }

        if (data.queue.length === 0) {
            data.current = null;
            data.startedAt = null;
            this.stopProgress(guildId);
            return;
        }

        data.current = data.queue.shift();
        data.startedAt = Date.now();

        await this.playCurrent(guildId);
    }

    async playCurrent(guildId) {
        const data = this.guilds.get(guildId);

        if (!data || !data.current) {
            return;
        }

        this.cleanupProcesses(guildId);

        const track = data.current;

        console.log(
            `[Music] Resolving audio with yt-dlp: ${track.url}`
        );

        let streamUrl;

        try {
            streamUrl = await this.getAudioUrl(
                track.url,
                guildId
            );
        } catch (error) {
            console.error(
                `[Music] yt-dlp could not resolve "${track.title}":`,
                error.message
            );

            throw error;
        }

        if (!streamUrl) {
            throw new Error(
                "yt-dlp did not return an audio URL."
            );
        }

        console.log(
            `[Music] Starting FFmpeg for: ${track.title}`
        );

        const ffmpeg = spawn(
            FFMPEG_PATH,
            [
                "-hide_banner",
                "-loglevel",
                "error",

                "-reconnect",
                "1",
                "-reconnect_streamed",
                "1",
                "-reconnect_delay_max",
                "5",

                "-i",
                streamUrl,

                "-vn",

                "-ac",
                "2",

                "-ar",
                "48000",

                "-c:a",
                "libopus",

                "-b:a",
                "128k",

                "-f",
                "ogg",

                "pipe:1"
            ],
            {
                stdio: [
                    "ignore",
                    "pipe",
                    "pipe"
                ]
            }
        );

        data.ffmpegProcess = ffmpeg;

        let ffmpegError = "";

        ffmpeg.stderr.on("data", chunk => {
            ffmpegError += chunk.toString();

            if (ffmpegError.length > 4000) {
                ffmpegError =
                    ffmpegError.slice(-4000);
            }
        });

        ffmpeg.on("error", error => {
            console.error(
                `[Music] FFmpeg process error in ${guildId}:`,
                error
            );
        });

        ffmpeg.on("close", code => {
            if (data.ffmpegProcess === ffmpeg) {
                data.ffmpegProcess = null;
            }

            if (code !== 0 && code !== null) {
                console.error(
                    `[Music] FFmpeg exited with code ${code} in ${guildId}`
                );

                if (ffmpegError) {
                    console.error(
                        `[Music] FFmpeg error: ${ffmpegError}`
                    );
                }
            }
        });

        const resource = createAudioResource(
            ffmpeg.stdout,
            {
                inputType: StreamType.OggOpus,
                inlineVolume: true
            }
        );

        resource.volume.setVolume(data.volume);

        data.player.play(resource);

        data.startedAt = Date.now();

        this.startProgress(guildId);

        console.log(
            `[Music] Now playing: ${track.title}`
        );
    }

    getAudioUrl(url, guildId) {
        return new Promise((resolve, reject) => {
            const args = [
                ...YTDLP_COMMON_ARGS,

                "-f",
                "bestaudio/best",

                "-g",

                url
            ];

            console.log(
                `[Music] Running yt-dlp for ${url}`
            );

            const process = spawn(
                YTDLP_PATH,
                args,
                {
                    stdio: [
                        "ignore",
                        "pipe",
                        "pipe"
                    ]
                }
            );

            const data =
                this.guilds.get(guildId);

            if (data) {
                data.ytDlpProcess = process;
            }

            let stdout = "";
            let stderr = "";

            process.stdout.on("data", chunk => {
                stdout += chunk.toString();
            });

            process.stderr.on("data", chunk => {
                stderr += chunk.toString();
            });

            process.on("error", error => {
                if (
                    data &&
                    data.ytDlpProcess === process
                ) {
                    data.ytDlpProcess = null;
                }

                reject(error);
            });

            process.on("close", code => {
                if (
                    data &&
                    data.ytDlpProcess === process
                ) {
                    data.ytDlpProcess = null;
                }

                if (code !== 0) {
                    console.error(
                        `[Music] yt-dlp exited with code ${code}`
                    );

                    if (stderr) {
                        console.error(
                            `[Music] yt-dlp stderr: ${stderr}`
                        );
                    }

                    reject(
                        new Error(
                            stderr ||
                            `yt-dlp exited with code ${code}`
                        )
                    );

                    return;
                }

                const streamUrl =
                    stdout
                        .trim()
                        .split(/\r?\n/)
                        .filter(Boolean)
                        .pop();

                if (!streamUrl) {
                    reject(
                        new Error(
                            "yt-dlp returned no audio URL."
                        )
                    );

                    return;
                }

                resolve(streamUrl);
            });
        });
    }

    pause(guildId) {
        const data = this.guilds.get(guildId);

        if (!data) {
            return false;
        }

        return data.player.pause();
    }

    resume(guildId) {
        const data = this.guilds.get(guildId);

        if (!data) {
            return false;
        }

        return data.player.unpause();
    }

    async skip(guildId) {
        const data = this.guilds.get(guildId);

        if (!data) {
            return false;
        }

        this.cleanupProcesses(guildId);

        data.player.stop();

        return true;
    }

    stop(guildId) {
        const data = this.guilds.get(guildId);

        if (!data) {
            return false;
        }

        data.queue = [];
        data.current = null;
        data.startedAt = null;

        this.cleanupProcesses(guildId);
        this.stopProgress(guildId);

        data.player.stop();

        return true;
    }

    setVolume(guildId, volume) {
        const data = this.guilds.get(guildId);

        if (!data) {
            return false;
        }

        data.volume = volume / 100;

        const resource =
            data.player.state.resource;

        if (
            resource &&
            resource.volume
        ) {
            resource.volume.setVolume(
                data.volume
            );
        }

        return true;
    }

    toggleLoop(guildId) {
        const data = this.guilds.get(guildId);

        if (!data) {
            return false;
        }

        data.loop = !data.loop;

        return data.loop;
    }

    shuffle(guildId) {
        const data = this.guilds.get(guildId);

        if (!data) {
            return false;
        }

        for (
            let i = data.queue.length - 1;
            i > 0;
            i--
        ) {
            const j =
                Math.floor(
                    Math.random() * (i + 1)
                );

            [
                data.queue[i],
                data.queue[j]
            ] = [
                data.queue[j],
                data.queue[i]
            ];
        }

        return true;
    }

    clear(guildId) {
        const data = this.guilds.get(guildId);

        if (!data) {
            return false;
        }

        data.queue = [];

        return true;
    }

    remove(guildId, index) {
        const data = this.guilds.get(guildId);

        if (!data) {
            return null;
        }

        if (
            index < 0 ||
            index >= data.queue.length
        ) {
            return null;
        }

        return data.queue.splice(index, 1)[0];
    }

    getPosition(guildId) {
        const data = this.guilds.get(guildId);

        if (!data) {
            return 0;
        }

        const resource =
            data.player.state.resource;

        if (!resource) {
            return 0;
        }

        return resource.playbackDuration || 0;
    }

    getGuildDataPublic(guildId) {
        return this.guilds.get(guildId);
    }

    startProgress(guildId) {
        const data = this.guilds.get(guildId);

        if (!data) {
            return;
        }

        this.stopProgress(guildId);

        data.progressInterval =
            setInterval(async () => {
                try {
                    if (
                        !data.nowPlayingMessage ||
                        !data.current
                    ) {
                        return;
                    }

                    const {
                        buildNowPlayingEmbed,
                        buildNowPlayingButtons
                    } = require(
                        "../commands/music/nowplaying"
                    );

                    const embed =
                        buildNowPlayingEmbed(
                            guildId
                        );

                    const buttons =
                        buildNowPlayingButtons();

                    await data.nowPlayingMessage.edit({
                        embeds: [embed],
                        components: [buttons]
                    });
                } catch (error) {
                    console.error(
                        "[Music] Now Playing update error:",
                        error
                    );
                }
            }, 10000);
    }

    stopProgress(guildId) {
        const data = this.guilds.get(guildId);

        if (!data) {
            return;
        }

        if (data.progressInterval) {
            clearInterval(
                data.progressInterval
            );

            data.progressInterval = null;
        }
    }

    cleanupProcesses(guildId) {
        const data = this.guilds.get(guildId);

        if (!data) {
            return;
        }

        if (data.ytDlpProcess) {
            try {
                data.ytDlpProcess.kill("SIGKILL");
            } catch {}

            data.ytDlpProcess = null;
        }

        if (data.ffmpegProcess) {
            try {
                data.ffmpegProcess.kill("SIGKILL");
            } catch {}

            data.ffmpegProcess = null;
        }
    }

    leave(guildId) {
        const data = this.guilds.get(guildId);

        if (!data) {
            return false;
        }

        this.cleanupProcesses(guildId);
        this.stopProgress(guildId);

        if (data.connection) {
            try {
                data.connection.destroy();
            } catch {}
        }

        try {
            data.player.stop();
        } catch {}

        this.guilds.delete(guildId);

        return true;
    }
}

module.exports = new MusicManager();