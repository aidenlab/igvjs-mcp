# igvjs-mcp

Lets a person explore genomic data with igv.js beside a Claude or ChatGPT conversation, mixing loose spoken requests to the model with precise hands-on manipulation in the genome browser itself.

## Language

**Host**:
The chat application, Claude or ChatGPT, that a person talks to and that displays the Viewer.
_Avoid_: Client, chat app

**Conversation**:
One chat between a person and the model inside a Host.
_Avoid_: Session, chat session, thread

**Connector**:
This project as a person adds it to a Host, giving the model the ability to open and drive a Viewer.
_Avoid_: Plugin, integration

**Side panel**:
The Host's own browser pane beside the Conversation, where the Viewer is shown. Where a Host has none, a browser tab takes its place.
_Avoid_: Sidebar, artifact panel, canvas

**Viewer**:
The web page, opened in the Side panel, that houses the igv.js genome browser and the Control panel. A person knows it as igv-bot.
_Avoid_: Widget, app, embed

**Control panel**:
The retractable region of the Viewer holding the widgets a person uses to manipulate the genome browser directly.
_Avoid_: Side panel, sidebar, toolbar

**Session**:
The complete description of what the genome browser is showing: genome, loci and tracks, as igv.js defines it. It is the single source of truth and is owned by the Viewer.
_Avoid_: State, config

**Session summary**:
The compact account of the Session that the model is given with every tool reply, reflecting every change, whoever made it.
_Avoid_: State, context

**Room**:
The live channel on the server that joins the Connector to its Viewer, identified by a Room id. It carries commands to the Viewer and keeps the latest Session summary and Session.
_Avoid_: Session, channel

**Join link**:
The Viewer's URL carrying `?room=`; opening it shows the Viewer connected to that Room.
_Avoid_: Viewer URL, connection URL, shareable URL

**Shareable URL**:
A link that opens the current Session in igv-webapp for someone else, with no Room involved.
_Avoid_: Join link, share link

**Catalogue**:
The published table of tracks available from a data provider such as ENCODE or 4DN, which the model searches to turn a loose request into specific tracks.
_Avoid_: Registry, data source, datasource
