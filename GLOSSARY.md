# igvjs-mcp

Lets a person explore genomic data with igv.js from inside a Claude or ChatGPT conversation, mixing loose spoken requests to the model with precise hands-on manipulation in the genome browser itself.

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

**Viewer**:
The self-contained web page embedded in a Conversation that houses the igv.js genome browser and the Control panel.
_Avoid_: Widget, app, embed

**Control panel**:
The retractable region of the Viewer holding the widgets a person uses to manipulate the genome browser directly.
_Avoid_: Side panel, sidebar, toolbar

**Session**:
The complete description of what the genome browser is showing: genome, loci and tracks, as igv.js defines it. It is the single source of truth and is owned by the Viewer.
_Avoid_: State, config

**Catalogue**:
The published table of tracks available from a data provider such as ENCODE or 4DN, which the model searches to turn a loose request into specific tracks.
_Avoid_: Registry, data source, datasource

**Session summary**:
The compact account of the Session that the model is given after every change, whoever made it.
_Avoid_: State, context
