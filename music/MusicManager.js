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

const YOUTUBE_COOKIES =
    "/home/bartenderadmin/Bartender/cookies/youtube.txt";

const NODE_PATH =
    "/home/bartenderadmin/.nvm/versions/node/v24.21.0/bin/node";

const YTDLP_COMMON_ARGS = [
    "--verbose",
    "--cookies",
    YOUTUBE_COOKIES,
    "--js-runtimes",
    `node:${NODE_PATH}`,
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
                resource: null,

                volume: 1.0,
                loop: false,

                textChannel: null,
                nowPlayingMessage: null,

                progressInterval: null,
                startedAt: null,

                ytDlpProcess: null,
                ffmpegProcess: null
            };

            player.on(AudioPlayerStatus.Idle, () => {
                this.cleanupProcesses(guildId);

                const guildData = this.guilds.get(guildId);

                if (!guildData) return;

                guildData.resource = null;
                guildData.startedAt = null;

                if (guildData.loop && guildData.current) {
                    this.playCurrent(guildId).catch(console.error);
                    return;
                }

                guildData.current = null;

                this.stopProgress(guildId);

                if (guildData.queue.length > 0) {
                    this.playNext(guildId).catch(console.error);
                }
            });

            player.on("error", (error) => {
                console.error(
                    `[Music] Audio player error in ${guildId}:`,
                    error
                );

                this.cleanupProcesses(guildId);

                const guildData = this.guilds.get(guildId);

                if (!guildData) return;

                guildData.resource = null;
                guildData.current = null;
                guildData.startedAt = null;

                this.stopProgress(guildId);

                if (guildData.queue.length > 0) {
                    this.playNext(guildId).catch(console.error);
                }
            });

            this.guilds.set(guildId, data);
        }

        return this.guilds.get(guildId);
    }

    getGuildDataPublic(guildId) {
        const data = this.getGuildData(guildId);

        let position = 0;

        if (data.current && data.startedAt) {
            position = Math.max(
                0,
                Math.floor((Date.now() - data.startedAt) / 1000)
            );
        }

        if (data.current && data.current.durationInSec) {
            position = Math.min(
                position,
                data.current.durationInSec
            );
        }

        return {
            queue: [...data.queue],
            current: data.current,
            volume: data.volume,
            loop: data.loop,
            position,
            nowPlayingMessage: data.nowPlayingMessage
                ? {
                      id: data.nowPlayingMessage.id,
                      channelId: data.nowPlayingMessage.channelId
                  }
                : null
        };
    }

    connect(guildId, voiceChannel) {
        const data = this.getGuildData(guildId);

        if (
            data.connection &&
            data.connection.joinConfig.channelId === voiceChannel.id
        ) {
            return data.connection;
        }

        if (data.connection) {
            try {
                data.connection.destroy();
            } catch {}
        }

        data.connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: guildId,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator,
            selfDeaf: true
        });

        data.connection.subscribe(data.player);

        return data.connection;
    }

    setTextChannel(guildId, channel) {
        const data = this.getGuildData(guildId);
        data.textChannel = channel;
    }

    async add(guildId, track) {
        const data = this.getGuildData(guildId);

        data.queue.push(track);

        /*
         * If nothing is currently playing, immediately start
         * the new track.
         */
        if (!data.current) {
            await this.playNext(guildId);
        }

        return data;
    }

    async playNext(guildId) {
        const data = this.getGuildData(guildId);

        if (data.queue.length === 0) {
            data.current = null;
            data.resource = null;
            data.startedAt = null;

            this.stopProgress(guildId);

            return;
        }

        data.resource = null;

        data.current = data.queue.shift();

        await this.playCurrent(guildId);
    }

    async playCurrent(guildId) {
        const data = this.getGuildData(guildId);

        if (!data.current) {
            return;
        }

        this.cleanupProcesses(guildId);

        const track = data.current;

        console.log(
            `[Music] Resolving audio with yt-dlp: ${track.url}`
        );

        const streamUrl = await this.getAudioUrl(
            track.url,
            guildId
        );

        console.log(
            `[Music] Starting FFmpeg for: ${track.title}`
        );

        const ffmpegArgs = [
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
        ];

        const ffmpeg = spawn(
            FFMPEG_PATH,
            ffmpegArgs,
            {
                stdio: ["ignore", "pipe", "pipe"]
            }
        );

        data.ffmpegProcess = ffmpeg;

        ffmpeg.stderr.on("data", (chunk) => {
            const message = chunk.toString().trim();

            if (message) {
                console.error(
                    `[Music] FFmpeg: ${message}`
                );
            }
        });

        ffmpeg.on("error", (error) => {
            console.error(
                `[Music] FFmpeg process error:`,
                error
            );
        });

        ffmpeg.on("close", (code) => {
            if (code !== 0) {
                console.error(
                    `[Music] FFmpeg exited with code ${code}`
                );
            }
        });

        const resource = createAudioResource(
            ffmpeg.stdout,
            {
                inputType: StreamType.OggOpus,
                inlineVolume: true
            }
        );

        data.resource = resource;

        resource.volume.setVolume(data.volume);

        data.startedAt = Date.now();

        data.player.play(resource);

        this.startProgress(guildId);
    }

    getAudioUrl(url, guildId) {
        return new Promise((resolve, reject) => {
            console.log(
                `[Music] Running yt-dlp for ${url}`
            );

            const args = [
                ...YTDLP_COMMON_ARGS,

                "-f",
                "bestaudio/best",

                "-g",

                url
            ];

            const process = spawn(
                YTDLP_PATH,
                args,
                {
                    stdio: ["ignore", "pipe", "pipe"]
                }
            );

            const data = this.getGuildData(guildId);

            data.ytDlpProcess = process;

            let stdout = "";
            let stderr = "";

            process.stdout.on("data", (chunk) => {
                stdout += chunk.toString();
            });

            process.stderr.on("data", (chunk) => {
                stderr += chunk.toString();
            });

            process.on("error", (error) => {
                reject(error);
            });

            process.on("close", (code) => {
                data.ytDlpProcess = null;

                if (code !== 0) {
                    console.error(
                        `[Music] yt-dlp failed:`,
                        stderr
                    );

                    reject(
                        new Error(
                            stderr ||
                            `yt-dlp exited with code ${code}`
                        )
                    );

                    return;
                }

                const urls = stdout
                    .split(/\r?\n/)
                    .map((line) => line.trim())
                    .filter(Boolean);

                const streamUrl =
                    urls[urls.length - 1];

                if (!streamUrl) {
                    reject(
                        new Error(
                            "yt-dlp did not return an audio URL"
                        )
                    );

                    return;
                }

                resolve(streamUrl);
            });
        });
    }

    pause(guildId) {
        const data = this.getGuildData(guildId);

        return data.player.pause();
    }

    resume(guildId) {
        const data = this.getGuildData(guildId);

        /*
         * If paused, resume normally.
         */
        if (data.player.state.status === AudioPlayerStatus.Paused) {
            return data.player.unpause();
        }

        /*
         * If there is no current track but something is queued,
         * start the queue.
         */
        if (!data.current && data.queue.length > 0) {
            this.playNext(guildId).catch(console.error);
            return true;
        }

        return false;
    }

    skip(guildId) {
        const data = this.getGuildData(guildId);

        data.player.stop();

        return true;
    }

    stop(guildId) {
        const data = this.getGuildData(guildId);

        data.queue = [];
        data.current = null;
        data.resource = null;
        data.startedAt = null;

        this.stopProgress(guildId);

        this.cleanupProcesses(guildId);

        data.player.stop(true);

        return true;
    }

    setVolume(guildId, volume) {
        const data = this.getGuildData(guildId);

        const newVolume = Math.max(
            0,
            Math.min(2, Number(volume))
        );

        data.volume = newVolume;

        /*
         * This is the important part:
         * change the currently playing AudioResource.
         */
        if (data.resource?.volume) {
            data.resource.volume.setVolume(
                newVolume
            );
        }

        return newVolume;
    }

    toggleLoop(guildId) {
        const data = this.getGuildData(guildId);

        data.loop = !data.loop;

        return data.loop;
    }

    shuffle(guildId) {
        const data = this.getGuildData(guildId);

        for (
            let i = data.queue.length - 1;
            i > 0;
            i--
        ) {
            const j = Math.floor(
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

        return data.queue;
    }

    clear(guildId) {
        const data = this.getGuildData(guildId);

        data.queue = [];

        return true;
    }

    remove(guildId, index) {
        const data = this.getGuildData(guildId);

        if (
            index < 0 ||
            index >= data.queue.length
        ) {
            return null;
        }

        return data.queue.splice(index, 1)[0];
    }

    getPosition(guildId) {
        const data = this.getGuildData(guildId);

        if (!data.current || !data.startedAt) {
            return 0;
        }

        return Math.floor(
            (Date.now() - data.startedAt) / 1000
        );
    }

    startProgress(guildId) {
        const data = this.getGuildData(guildId);

        this.stopProgress(guildId);

        if (!data.textChannel) {
            return;
        }

        /*
         * Update the now-playing message every 10 seconds.
         * This assumes your nowplaying.js exports these helpers.
         */
        data.progressInterval = setInterval(
            async () => {
                try {
                    if (
                        !data.current ||
                        !data.nowPlayingMessage
                    ) {
                        return;
                    }

                    const nowPlaying =
                        require(
                            "../commands/music/nowplaying"
                        );

                    if (
                        typeof nowPlaying.buildNowPlayingEmbed ===
                        "function"
                    ) {
                        const embed =
                            nowPlaying.buildNowPlayingEmbed(
                                this.getGuildDataPublic(
                                    guildId
                                )
                            );

                        await data.nowPlayingMessage.edit({
                            embeds: [embed]
                        });
                    }
                } catch (error) {
                    console.error(
                        "[Music] Failed to update now playing:",
                        error
                    );
                }
            },
            10000
        );
    }

    stopProgress(guildId) {
        const data = this.getGuildData(guildId);

        if (data.progressInterval) {
            clearInterval(data.progressInterval);
            data.progressInterval = null;
        }
    }

    cleanupProcesses(guildId) {
        const data = this.getGuildData(guildId);

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
        const data = this.getGuildData(guildId);

        this.stop(guildId);

        if (data.connection) {
            try {
                data.connection.destroy();
            } catch {}

            data.connection = null;
        }

        this.guilds.delete(guildId);

        return true;
    }
}

module.exports = new MusicManager();