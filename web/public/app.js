"use strict";

/*

* ============================================================
* BARTENDER DASHBOARD
* ============================================================
*
* Frontend JavaScript for:
*
* /api/stats/overview
* /api/stats/daily
* /api/stats/commands
* /api/stats/channels
* /api/stats/users
* /api/stats/members
* /api/status
*
* No framework or build step required.
*
* ============================================================
  */

/* ============================================================

* DOM HELPERS
* ============================================================
  */

const $ = id =>
document.getElementById(id);

/* ============================================================

* FORMATTING
* ============================================================
  */

function formatNumber(value) {

```
return Number(value || 0)
    .toLocaleString();
```

}

function escapeHtml(value) {

```
return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
```

}

function formatDate(value) {

```
if (!value) {
    return "Unknown";
}

const date =
    new Date(value);

if (
    Number.isNaN(
        date.getTime()
    )
) {
    return "Unknown";
}

return date.toLocaleString(
    undefined,
    {
        dateStyle: "medium",
        timeStyle: "short"
    }
);
```

}

function formatUptime(seconds) {

```
const totalSeconds =
    Math.max(
        0,
        Math.floor(
            Number(seconds) || 0
        )
    );


const days =
    Math.floor(
        totalSeconds / 86400
    );


const hours =
    Math.floor(
        (totalSeconds % 86400) / 3600
    );


const minutes =
    Math.floor(
        (totalSeconds % 3600) / 60
    );


if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
}


if (hours > 0) {
    return `${hours}h ${minutes}m`;
}


return `${minutes}m`;
```

}

/* ============================================================

* API
* ============================================================
  */

async function fetchJson(url) {

```
const response =
    await fetch(
        url,
        {
            cache: "no-store"
        }
    );


if (!response.ok) {

    throw new Error(
        `${response.status} ${response.statusText}`
    );
}


return response.json();
```

}

/* ============================================================

* OVERVIEW
* ============================================================
  */

async function loadOverview() {

```
const data =
    await fetchJson(
        "/api/stats/overview"
    );


if ($("members")) {

    $("members").textContent =
        formatNumber(
            data.members
        );
}


if ($("onlineMembers")) {

    $("onlineMembers").textContent =
        formatNumber(
            data.onlineMembers
        );
}


if ($("messages")) {

    $("messages").textContent =
        formatNumber(
            data.total_messages
        );
}


if ($("commands")) {

    $("commands").textContent =
        formatNumber(
            data.total_commands
        );
}


if ($("songsPlayed")) {

    $("songsPlayed").textContent =
        formatNumber(
            data.total_songs_played
        );
}


if ($("modActions")) {

    $("modActions").textContent =
        formatNumber(
            data.total_mod_actions
        );
}
```

}

/* ============================================================

* BOT STATUS
* ============================================================
  */

async function loadStatus() {

```
const data =
    await fetchJson(
        "/api/status"
    );


const status =
    $("botStatus");


if (status) {

    if (data.online) {

        status.className =
            "status online";

        status.innerHTML = `
            <span class="status-dot"></span>
            Online
        `;

    } else {

        status.className =
            "status offline";

        status.innerHTML = `
            <span class="status-dot"></span>
            Offline
        `;
    }
}


if ($("uptime")) {

    $("uptime").textContent =
        formatUptime(
            data.uptime
        );
}


if ($("voiceChannel")) {

    if (
        data.currentVoiceChannel
    ) {

        $("voiceChannel").textContent =
            data.currentVoiceChannel.name;

    } else {

        $("voiceChannel").textContent =
            "Not connected";
    }
}
```

}

/* ============================================================

* MOST USED COMMANDS
* ============================================================
  */

async function loadCommands() {

```
const commands =
    await fetchJson(
        "/api/stats/commands"
    );


const container =
    $("commandList");


if (!container) {
    return;
}


if (!commands.length) {

    container.innerHTML = `
        <div class="list-item">

            <span class="list-name">
                No command activity yet
            </span>

        </div>
    `;

    return;
}


container.innerHTML =
    commands
        .map(
            command => `

                <div class="list-item">

                    <span class="list-name">
                        /${escapeHtml(
                            command.command
                        )}
                    </span>

                    <span class="list-value">
                        ${formatNumber(
                            command.uses
                        )}
                    </span>

                </div>

            `
        )
        .join("");
```

}

/* ============================================================

* MOST ACTIVE CHANNELS
* ============================================================
  */

async function loadChannels() {

```
const channels =
    await fetchJson(
        "/api/stats/channels"
    );


const container =
    $("channelList");


if (!container) {
    return;
}


if (!channels.length) {

    container.innerHTML = `
        <div class="list-item">

            <span class="list-name">
                No channel activity yet
            </span>

        </div>
    `;

    return;
}


container.innerHTML =
    channels
        .map(
            channel => `

                <div class="list-item">

                    <span class="list-name">
                        #${escapeHtml(
                            channel.channel_name
                        )}
                    </span>

                    <span class="list-value">
                        ${formatNumber(
                            channel.messages
                        )}
                    </span>

                </div>

            `
        )
        .join("");
```

}

/* ============================================================

* MOST ACTIVE MEMBERS
* ============================================================
  */

async function loadUsers() {

```
const users =
    await fetchJson(
        "/api/stats/users"
    );


const container =
    $("userList");


if (!container) {
    return;
}


if (!users.length) {

    container.innerHTML = `
        <div class="list-item">

            <span class="list-name">
                No member activity yet
            </span>

        </div>
    `;

    return;
}


container.innerHTML =
    users
        .map(
            user => `

                <div class="list-item">

                    <span class="list-name">
                        ${escapeHtml(
                            user.username
                        )}
                    </span>

                    <span class="list-value">
                        ${formatNumber(
                            user.messages
                        )}
                    </span>

                </div>

            `
        )
        .join("");
```

}

/* ============================================================

* MEMBER JOIN / LEAVE EVENTS
* ============================================================
  */

async function loadMemberEvents() {

```
const events =
    await fetchJson(
        "/api/stats/members"
    );


const container =
    $("memberEvents");


if (!container) {
    return;
}


if (!events.length) {

    container.innerHTML = `
        <div class="event">

            <div>

                <div class="event-user">
                    No member events yet
                </div>

                <div class="event-date">
                    New joins and leaves will appear here.
                </div>

            </div>

        </div>
    `;

    return;
}


container.innerHTML =
    events
        .map(
            event => {

                const type =
                    event.event === "join"
                        ? "join"
                        : "leave";


                return `

                    <div class="event">

                        <div>

                            <div class="event-user">
                                ${escapeHtml(
                                    event.username
                                )}
                            </div>

                            <div class="event-date">
                                ${formatDate(
                                    event.created_at
                                )}
                            </div>

                        </div>

                        <div
                            class="event-type ${type}"
                        >
                            ${type}
                        </div>

                    </div>

                `;
            }
        )
        .join("");
```

}

/* ============================================================

* ACTIVITY CHART
* ============================================================
  */

async function loadChart() {

```
const data =
    await fetchJson(
        "/api/stats/daily?days=30"
    );


drawChart(data);
```

}

function drawChart(data) {

```
const canvas =
    $("activityChart");


if (!canvas) {
    return;
}


const wrapper =
    canvas.parentElement;


if (!wrapper) {
    return;
}


const width =
    wrapper.clientWidth;


const height =
    wrapper.clientHeight;


if (
    width <= 0 ||
    height <= 0
) {
    return;
}


const ratio =
    window.devicePixelRatio || 1;


canvas.width =
    Math.floor(
        width * ratio
    );


canvas.height =
    Math.floor(
        height * ratio
    );


canvas.style.width =
    `${width}px`;


canvas.style.height =
    `${height}px`;


const ctx =
    canvas.getContext(
        "2d"
    );


ctx.setTransform(
    ratio,
    0,
    0,
    ratio,
    0,
    0
);


/*
 * Clear canvas.
 */

ctx.clearRect(
    0,
    0,
    width,
    height
);


/*
 * Sort oldest → newest.
 */

const points =
    Array.isArray(data)
        ? [...data].sort(
            (a, b) =>
                a.date.localeCompare(
                    b.date
                )
        )
        : [];


/*
 * Chart padding.
 */

const padding = {
    top: 34,
    right: 20,
    bottom: 40,
    left: 52
};


const chartWidth =
    Math.max(
        1,
        width -
        padding.left -
        padding.right
    );


const chartHeight =
    Math.max(
        1,
        height -
        padding.top -
        padding.bottom
    );


/*
 * Empty state.
 */

if (!points.length) {

    ctx.fillStyle =
        "#687386";

    ctx.font =
        "13px system-ui";

    ctx.fillText(
        "No activity data yet",
        padding.left,
        height / 2
    );

    return;
}


/*
 * Find largest value.
 */

const largest =
    Math.max(
        1,
        ...points.map(
            item =>
                Math.max(
                    Number(
                        item.messages
                    ) || 0,

                    Number(
                        item.commands
                    ) || 0
                )
        )
    );


/*
 * Add a little headroom.
 */

const maximum =
    largest > 1
        ? largest * 1.15
        : 1;


/*
 * Convert data into coordinates.
 */

function getPoint(
    index,
    value
) {

    const x =
        points.length === 1

            ? padding.left +
              chartWidth / 2

            : padding.left +
              (
                  index /
                  (
                      points.length - 1
                  )
              ) *
              chartWidth;


    const y =
        padding.top +
        chartHeight -
        (
            value /
            maximum
        ) *
        chartHeight;


    return {
        x,
        y
    };
}


/*
 * Grid lines.
 */

ctx.lineWidth = 1;

for (
    let i = 0;
    i <= 4;
    i++
) {

    const y =
        padding.top +
        chartHeight -
        (
            chartHeight *
            i /
            4
        );


    ctx.strokeStyle =
        "rgba(255,255,255,0.055)";


    ctx.beginPath();

    ctx.moveTo(
        padding.left,
        y
    );

    ctx.lineTo(
        width -
        padding.right,
        y
    );

    ctx.stroke();


    /*
     * Y-axis number.
     */

    const value =
        Math.round(
            maximum *
            i /
            4
        );


    ctx.fillStyle =
        "#687386";

    ctx.font =
        "11px system-ui";

    ctx.fillText(
        value.toLocaleString(),
        8,
        y + 4
    );
}


/*
 * Draw a line.
 */

function drawLine(
    field,
    color
) {

    ctx.strokeStyle =
        color;

    ctx.lineWidth =
        2.5;

    ctx.lineJoin =
        "round";

    ctx.lineCap =
        "round";


    ctx.beginPath();


    points.forEach(
        (item, index) => {

            const value =
                Number(
                    item[field]
                ) || 0;


            const point =
                getPoint(
                    index,
                    value
                );


            if (
                index === 0
            ) {

                ctx.moveTo(
                    point.x,
                    point.y
                );

            } else {

                ctx.lineTo(
                    point.x,
                    point.y
                );
            }
        }
    );


    ctx.stroke();


    /*
     * Small points.
     */

    ctx.fillStyle =
        color;


    points.forEach(
        (item, index) => {

            const value =
                Number(
                    item[field]
                ) || 0;


            const point =
                getPoint(
                    index,
                    value
                );


            ctx.beginPath();

            ctx.arc(
                point.x,
                point.y,
                2.5,
                0,
                Math.PI * 2
            );

            ctx.fill();
        }
    );
}


/*
 * Messages.
 */

drawLine(
    "messages",
    "#5865f2"
);


/*
 * Commands.
 */

drawLine(
    "commands",
    "#a78bfa"
);


/*
 * Date labels.
 */

ctx.fillStyle =
    "#687386";

ctx.font =
    "11px system-ui";


const labelEvery =
    Math.max(
        1,
        Math.ceil(
            points.length / 7
        )
    );


points.forEach(
    (item, index) => {

        if (
            index % labelEvery !== 0 &&
            index !==
                points.length - 1
        ) {
            return;
        }


        const point =
            getPoint(
                index,
                0
            );


        const label =
            item.date.slice(5);


        ctx.fillText(
            label,
            point.x - 14,
            height - 12
        );
    }
);


/*
 * Legend.
 */

drawLegend(
    ctx,
    padding.left,
    12,
    "#5865f2",
    "Messages"
);


drawLegend(
    ctx,
    padding.left + 95,
    12,
    "#a78bfa",
    "Commands"
);
```

}

/* ============================================================

* CHART LEGEND
* ============================================================
  */

function drawLegend(
ctx,
x,
y,
color,
label
) {

```
ctx.fillStyle =
    color;


ctx.beginPath();

ctx.arc(
    x + 4,
    y,
    4,
    0,
    Math.PI * 2
);

ctx.fill();


ctx.fillStyle =
    "#8d98aa";

ctx.font =
    "11px system-ui";


ctx.fillText(
    label,
    x + 13,
    y + 4
);
```

}

/* ============================================================

* ERROR HANDLING
* ============================================================
  */

function showDashboardError(
error
) {

```
console.error(
    "[Bartender Dashboard]",
    error
);


const status =
    $("botStatus");


if (!status) {
    return;
}


status.className =
    "status offline";


status.innerHTML = `
    <span class="status-dot"></span>
    Connection error
`;
```

}

/* ============================================================

* LOAD EVERYTHING
* ============================================================
  */

async function loadDashboard() {

```
try {

    await Promise.all([
        loadOverview(),
        loadStatus(),
        loadCommands(),
        loadChannels(),
        loadUsers(),
        loadMemberEvents(),
        loadChart()
    ]);

} catch (error) {

    showDashboardError(
        error
    );
}
```

}

/* ============================================================

* INITIAL LOAD
* ============================================================
  */

loadDashboard();

/* ============================================================

* AUTOMATIC REFRESH
* ============================================================
*
* Refresh dashboard data every 30 seconds.
*
* ============================================================
  */

setInterval(
loadDashboard,
30000
);

/* ============================================================

* WINDOW RESIZE
* ============================================================
*
* Redraw chart when browser size changes.
*
* ============================================================
  */

window.addEventListener(
"resize",
() => {

```
    loadChart()
        .catch(
            error =>
                console.error(
                    "[Bartender Chart]",
                    error
                )
        );
}
```

);
