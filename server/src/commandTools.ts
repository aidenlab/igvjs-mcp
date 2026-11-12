import { z, type ZodRawShape } from 'zod'
import { COLOR_SCALE_TYPES, DISPLAY_MODES, GRAPH_TYPES, WINDOW_FUNCTIONS, type CommandType } from 'igvjs-mcp-viewer/protocol'

/**
 * A tool whose whole job is to send the Viewer one command. Its arguments are
 * the command's fields: the command is `{ type: commandType, ...arguments }`.
 */
export interface CommandTool {
  name: string
  title: string
  description: string
  inputSchema: ZodRawShape
  commandType: CommandType
  /** The argument that names a genome, if there is one. The command is sent only for a genome on the igv.org list, and carries the list's spelling of its id. */
  genomeArgument?: string
}

const REPLY = 'The reply is the resulting Session summary: genome, loci, and tracks in display order.'

/**
 * The line in each tool that can give a note (ADR 0006), for Hosts that make
 * little of the server's instructions, which say the same.
 */
const NOTE_LINE =
  'When the reply begins with "Note:", the request was carried out other than as asked: tell the person in one sentence of your own what was done and why; otherwise just confirm the change in a few words.'

/**
 * The command tools, one row each. Adding one is adding a row here, its
 * command to the protocol and its applier in the Viewer.
 */
export const COMMAND_TOOLS: CommandTool[] = [
  {
    name: 'go_to_locus',
    title: 'Go to a locus',
    description: `Move igv-bot to a locus given as coordinates, such as "chr8:127,735,434-127,742,951", or to a whole chromosome, such as "chr8". Use "all" for the whole-genome view. Several loci separated by spaces are shown side by side. For a gene name use go_to_gene. ${REPLY}`,
    inputSchema: {
      locus: z.string().describe('Coordinates as chr:start-end (1-based, commas allowed), a chromosome name, or "all"'),
    },
    commandType: 'go_to_locus',
  },
  {
    name: 'go_to_gene',
    title: 'Go to a gene',
    description: `Move igv-bot to a gene by its name, such as "MYC" or "BRCA1", looked up in the current genome. An unknown gene is reported as an error and the view does not move. ${REPLY}`,
    inputSchema: {
      gene: z.string().describe('Gene name or symbol, such as "MYC"'),
    },
    commandType: 'go_to_gene',
  },
  {
    name: 'zoom_in',
    title: 'Zoom in',
    description: `Zoom igv-bot in by a factor of two, keeping the centre of the view. Call it again to zoom further. The whole-genome view does not zoom: go to a locus or gene first. ${REPLY}`,
    inputSchema: {},
    commandType: 'zoom_in',
  },
  {
    name: 'zoom_out',
    title: 'Zoom out',
    description: `Zoom igv-bot out by a factor of two, keeping the centre of the view where possible. Call it again to zoom further. The whole-genome view does not zoom. ${REPLY}`,
    inputSchema: {},
    commandType: 'zoom_out',
  },
  {
    name: 'change_genome',
    title: 'Change genome',
    description: `Change igv-bot to another genome assembly, such as "hg19", "mm39" or "hs1" (human T2T). The tracks now loaded are removed and the new genome opens with its own default tracks, at its default view. Only the genomes on the igv.org genome list are available; for one that is not, the reply says so, lists those that are, and igv-bot is left as it was. ${REPLY}`,
    inputSchema: {
      genome: z.string().describe('Genome id as on the igv.org genome list, such as "hg38", "hg19", "mm39" or "hs1"'),
    },
    commandType: 'change_genome',
    genomeArgument: 'genome',
  },
  {
    name: 'load_tracks',
    title: 'Load tracks',
    description: `Load one or several tracks into igv-bot, each from the URL of its file. The URLs come from a reply of search_catalogues (pass the row's url, and its name as the track's name) or from the user, who may give any URL their browser can fetch. Load every track a request asks for in one call: they are shown in the order given, and the Session summary of the reply says where igv.js put them, as a rule above the genome's own annotation track. A track given no name gets igv.js's default, the name of its file. When a loose request matches many tracks in the Catalogues, pick a sensible default, say in one line what you picked, and load it; ask the user only when the candidates differ in a way they would care about. A track that does not load is reported as an error carrying igv.js's own message, as for a file that does not exist or a host that does not permit cross-origin requests; the other tracks of the call are still loaded, and the Session summary shows which. ${REPLY}`,
    inputSchema: {
      tracks: z
        .array(
          z.object({
            url: z.string().describe("The URL of the track's file, such as the url of a search_catalogues row"),
            name: z.string().optional().describe("The name to show the track under, such as the name of a search_catalogues row. Leave it out for the file's name."),
          }),
        )
        .min(1)
        .describe('The tracks to load, in the order they are to be shown, top to bottom'),
    },
    commandType: 'load_tracks',
  },
  {
    name: 'remove_track',
    title: 'Remove a track',
    description: `Remove one track from igv-bot, addressed by its name or by its position in the tracks of the Session summary, counted from 1 at the top: "the second track" is position 2 and "the bottom one" is the last. Give name or position, not both. The user also reorders and removes tracks by hand, so take a position from the Session summary of the reply just before, or call read_session_summary first. A name or position that matches no track is reported as an error listing the tracks, and a name that several tracks share as an error giving their positions; either way nothing is removed. The sequence track cannot be removed. ${REPLY}`,
    inputSchema: {
      name: z.string().optional().describe('The name of the track as the Session summary gives it. Case does not matter.'),
      // Any number: one that is no position is answered by the Viewer, which can list the tracks.
      position: z.number().optional().describe('The position of the track in the tracks of the Session summary: 1 is the top track'),
    },
    commandType: 'remove_track',
  },
  {
    name: 'set_track_height',
    title: 'Set track height',
    description: `Set the height of one, several or all tracks of igv-bot: to a number of pixels, or "taller" (half as high again) or "shorter" (two thirds as high), so that one undoes the other. A height runs from 1 to 1000 pixels: a number outside that is an error, and taller and shorter stop there. Address the tracks by their names, by their positions in the tracks of the Session summary, counted from 1 at the top, or pass all for every track. Change every track a request means in one call. The user also reorders, resizes and removes tracks by hand, so take positions and heights from the Session summary of the reply just before, or call read_session_summary first. A name or position that matches no track is reported as an error listing the tracks, and a name that several tracks share as an error giving their positions; either way no height is changed. The sequence track keeps its height: all leaves it as it is, and addressing it is an error. The Session summary gives heights in whole pixels. A reply begins with a note when taller or shorter stopped at a limit, or when every track already had the height asked for, so nothing changed. ${REPLY} ${NOTE_LINE}`,
    inputSchema: {
      // Any number: one that is no height is answered by the Viewer, which gives the limits.
      height: z
        .union([z.number(), z.enum(['taller', 'shorter'])])
        .describe('The height in pixels, from 1 to 1000, or "taller" for 1.5 times the height each track has now, or "shorter" for two thirds of it'),
      names: z.array(z.string()).optional().describe('The names of the tracks as the Session summary gives them. Case does not matter.'),
      // Any numbers: one that is no position is answered by the Viewer, which can list the tracks.
      positions: z.array(z.number()).optional().describe('The positions of the tracks in the tracks of the Session summary: 1 is the top track'),
      all: z.boolean().optional().describe('True for every track, in place of names and positions'),
    },
    commandType: 'set_track_height',
  },
  {
    name: 'rename_track',
    title: 'Rename a track',
    description: `Give one track of igv-bot a new name, the name it is shown under. Address the track by its name or by its position in the tracks of the Session summary, counted from 1 at the top; give name or position, not both, and the new name as newName. The user also reorders and renames tracks by hand, so take a position from the Session summary of the reply just before, or call read_session_summary first. A name or position that matches no track is reported as an error listing the tracks, and a name that several tracks share as an error giving their positions; either way nothing is renamed. The sequence track cannot be renamed. A reply begins with a note when the track already had the new name, so nothing changed. ${REPLY} ${NOTE_LINE}`,
    inputSchema: {
      name: z.string().optional().describe('The name of the track as the Session summary gives it now. Case does not matter.'),
      // Any number: one that is no position is answered by the Viewer, which can list the tracks.
      position: z.number().optional().describe('The position of the track in the tracks of the Session summary: 1 is the top track'),
      newName: z.string().describe('The name to show the track under from now on'),
    },
    commandType: 'rename_track',
  },
  {
    name: 'set_track_color',
    title: 'Set track color',
    description: `Set the color of one, several or all tracks of igv-bot, as igv.js's own "Set track color" and "Set alt color" do. color is the color a track is drawn in; altColor is a second color, for the negative values of a wig (signal) track and the minus-strand features of an annotation track. Give either or both, each as "#RRGGBB" or "rgb(R, G, B)": turn a color's name, such as "dark blue", into one of these. "unset" gives a track back the color it was loaded with. Annotation, alignment, variant, wig, interact and shoebox tracks take a color; only wig and annotation tracks take an altColor. Address the tracks by their names, by their positions in the tracks of the Session summary, counted from 1 at the top, or pass all for every track that takes the colors given. Change every track a request means in one call. The user also reorders, recolors and removes tracks by hand, so take positions from the Session summary of the reply just before, or call read_session_summary first. A call is all or nothing: a track named or placed that does not take a color given is an error saying why, and so is a wig track drawn as a heatmap, whose colors are set_signal_style's colorScale; a color that is not one of the forms above is an error too; either way no color is changed. The Session summary gives the colors a track has been given as its options' color and altColor. A reply begins with a note when all passed over tracks that do not take the colors, when a variant track colored by an attribute such as AF is drawn in the one color from then on, or when every track already had the colors, so nothing changed. ${REPLY} ${NOTE_LINE}`,
    inputSchema: {
      // Any string: one that is no color is answered by the Viewer, which gives the forms one takes.
      color: z.string().optional().describe('The color to draw the tracks in, as "#RRGGBB" or "rgb(R, G, B)", or "unset" for the color each was loaded with'),
      altColor: z
        .string()
        .optional()
        .describe("The color of a wig track's negative values or an annotation track's minus-strand features, as \"#RRGGBB\" or \"rgb(R, G, B)\", or \"unset\""),
      names: z.array(z.string()).optional().describe('The names of the tracks as the Session summary gives them. Case does not matter.'),
      // Any numbers: one that is no position is answered by the Viewer, which can list the tracks.
      positions: z.array(z.number()).optional().describe('The positions of the tracks in the tracks of the Session summary: 1 is the top track'),
      all: z.boolean().optional().describe('True for every track that takes the colors given, in place of names and positions'),
    },
    commandType: 'set_track_color',
  },
  {
    name: 'set_data_range',
    title: 'Set data range',
    description: `Set the data range of one, several or all tracks of igv-bot, as igv.js's own "Set data range", "Autoscale" and "Log scale" do: the values the track's height spans. Give a fixed min and max, or one of them to keep the other as the track has it; or autoscale true for a range that follows what is in view, or false to fix the range the track has now; and logScale, on or off. Give several of these at once, but not a fixed range with autoscale true. Wig (signal), alignment (its coverage), qtl, gwas and gcnv tracks, and interact tracks drawn with proportional arcs, have a data range; only wig and interact tracks have a log scale. Address the tracks by their names, by their positions in the tracks of the Session summary, counted from 1 at the top, or pass all for every track that takes what is given. Change every track a request means in one call. The user also reorders and changes tracks by hand, so take positions from the Session summary of the reply just before, or call read_session_summary first. A call is all or nothing: a track named or placed that has no data range, or no log scale when logScale is given, is an error saying why, and so is a wig track drawn as a heatmap, whose range is set_signal_style's colorScale; a min not below the max is an error too; either way nothing is changed. A fixed range, or autoscale turned off, takes a track out of an autoscale group the user made by hand. The Session summary gives a track's range as its options' min, max, autoscale and logScale. A reply begins with a note when tracks were taken out of an autoscale group, when all passed over tracks that do not take what is given, or when every track already had it, so nothing changed. ${REPLY} ${NOTE_LINE}`,
    inputSchema: {
      // Any numbers: a min not below the max is answered by the Viewer, which knows each track's range.
      min: z.number().optional().describe('The value at the bottom of the tracks'),
      max: z.number().optional().describe('The value at the top of the tracks'),
      autoscale: z.boolean().optional().describe('True for a range that follows what is in view; false to fix the range each track has now'),
      logScale: z.boolean().optional().describe('True to draw the values on a log scale, false for a linear one'),
      names: z.array(z.string()).optional().describe('The names of the tracks as the Session summary gives them. Case does not matter.'),
      // Any numbers: one that is no position is answered by the Viewer, which can list the tracks.
      positions: z.array(z.number()).optional().describe('The positions of the tracks in the tracks of the Session summary: 1 is the top track'),
      all: z.boolean().optional().describe('True for every track that takes what is given, in place of names and positions'),
    },
    commandType: 'set_data_range',
  },
  {
    name: 'set_signal_style',
    title: 'Set signal style',
    description: `Set how one, several or all wig (signal) tracks of igv-bot are drawn, as igv.js's own "Graph type", "Windowing function", "Flip y-axis" and "Set color scale" do. graphType draws the values as bar, line, points, heatmap or dynseq: dynseq draws the bases of the sequence at the height of the values, and shows them only below 2 bp per pixel, zoomed in far enough to read the sequence; further out it draws bars. windowFunction is how the values under one pixel are summed up: mean, min, max, or none to draw every value; a track offers those its file does. flipAxis true draws a track upside down, false the right way up. colorScale gives a heatmap its colors: from minColor at min to maxColor at max, or, with a mid, diverging through midColor at the mid; give only what changes, the rest kept as the track has it, and type gradient to drop the mid. Colors are "#RRGGBB" or "rgb(R, G, B)". Give several of these at once. Address the tracks by their names, by their positions in the tracks of the Session summary, counted from 1 at the top, or pass all for every track that takes what is given. Change every track a request means in one call. The user also reorders and changes tracks by hand, so take positions from the Session summary of the reply just before, or call read_session_summary first. A call is all or nothing: a track named or placed that is not a wig track, a colorScale for a track that is not drawn as a heatmap unless graphType heatmap is given with it, a flipAxis for one that is, unless another graphType is given with it, or a windowFunction its file does not offer, is an error saying why; so is a colorScale whose min is not below its max or whose mid is not between them; either way nothing is changed. The color and data range of a heatmap are its colorScale: set_track_color and set_data_range do not apply to it. The Session summary gives a track's style as its options' graphType, windowFunction, flipAxis and colorScale. A reply begins with a note when dynseq will not show at the current zoom, when all passed over tracks that do not take what is given, or when every track already had it, so nothing changed. ${REPLY} ${NOTE_LINE}`,
    inputSchema: {
      graphType: z.enum(GRAPH_TYPES).optional().describe('How the values are drawn'),
      windowFunction: z.enum(WINDOW_FUNCTIONS).optional().describe('How the values under one pixel are summed up; none draws every value'),
      flipAxis: z.boolean().optional().describe('True to draw the tracks upside down, false the right way up'),
      colorScale: z
        .object({
          type: z.enum(COLOR_SCALE_TYPES).optional().describe('gradient from min to max, or diverging about a mid. Left out, diverging when a mid is given or the track has one'),
          // Any numbers: bounds out of order are answered by the Viewer, which knows each track's scale.
          min: z.number().optional().describe('The value drawn in minColor, and any below it'),
          mid: z.number().optional().describe('The value drawn in midColor, between min and max'),
          max: z.number().optional().describe('The value drawn in maxColor, and any above it'),
          // Any strings: one that is no color is answered by the Viewer, whose error gives the forms one takes.
          minColor: z.string().optional().describe('"#RRGGBB" or "rgb(R, G, B)"'),
          midColor: z.string().optional().describe('"#RRGGBB" or "rgb(R, G, B)"'),
          maxColor: z.string().optional().describe('"#RRGGBB" or "rgb(R, G, B)"'),
        })
        .optional()
        .describe('The colors of tracks drawn as a heatmap: give only what changes'),
      names: z.array(z.string()).optional().describe('The names of the tracks as the Session summary gives them. Case does not matter.'),
      // Any numbers: one that is no position is answered by the Viewer, which can list the tracks.
      positions: z.array(z.number()).optional().describe('The positions of the tracks in the tracks of the Session summary: 1 is the top track'),
      all: z.boolean().optional().describe('True for every track that takes what is given, in place of names and positions'),
    },
    commandType: 'set_signal_style',
  },
  {
    name: 'set_display_mode',
    title: 'Set display mode',
    description: `Set how the rows of one, several or all tracks of igv-bot are laid out, as igv.js's own display mode menu does. collapsed draws every feature on one row; squished on rows packed thin; expanded on full-height rows, with labels; full, for an alignment track, gives every read a row of its own, unpacked; fill, for a seg track, stretches its samples to fill the track's height. Annotation and variant tracks offer collapsed, squished and expanded; alignment tracks expanded, squished and full; seg tracks squished, expanded and fill, though a seg track of mutations offers no fill. A wig (signal) track has no display mode: how it is drawn is set_signal_style's graphType. Address the tracks by their names, by their positions in the tracks of the Session summary, counted from 1 at the top, or pass all for every track that offers the mode. Change every track a request means in one call. The user also reorders and changes tracks by hand, so take positions from the Session summary of the reply just before, or call read_session_summary first. A call is all or nothing: a track named or placed that does not offer the mode is an error naming the modes it does, and nothing is changed. The Session summary gives a track's display mode as its options' displayMode; a track without one is expanded, igv.js's default. A reply begins with a note when all passed over tracks that do not offer the mode, or when every track already had it, so nothing changed. ${REPLY} ${NOTE_LINE}`,
    inputSchema: {
      mode: z.enum(DISPLAY_MODES).describe('How the rows are laid out: collapsed, squished and expanded for annotation and variant tracks; expanded, squished and full for alignment tracks; squished, expanded and fill for seg tracks'),
      names: z.array(z.string()).optional().describe('The names of the tracks as the Session summary gives them. Case does not matter.'),
      // Any numbers: one that is no position is answered by the Viewer, which can list the tracks.
      positions: z.array(z.number()).optional().describe('The positions of the tracks in the tracks of the Session summary: 1 is the top track'),
      all: z.boolean().optional().describe('True for every track that offers the mode, in place of names and positions'),
    },
    commandType: 'set_display_mode',
  },
  {
    name: 'set_crosshairs',
    title: 'Show or hide the crosshairs',
    description: `Show or hide igv-bot's crosshairs: a vertical and a horizontal line that follow the pointer across the tracks. The Session summary says whether they are showing, as crosshairs; the user also turns them on and off by hand. The whole-genome view has no crosshairs: showing them there is an error, so go to a locus or gene first, and going to the whole-genome view hides them. ${REPLY}`,
    inputSchema: {
      show: z.boolean().describe('True to show the crosshairs, false to hide them'),
    },
    commandType: 'set_crosshairs',
  },
  {
    name: 'set_centre_line',
    title: 'Show or hide the centre line',
    description: `Show or hide igv-bot's centre line: a vertical line marking the middle of the view, the point that zoom_in and zoom_out keep in place. Where several loci are shown side by side, each has its own. The Session summary says whether it is showing, as centreLine; the user also turns it on and off by hand. The whole-genome view has no centre line: showing it there is an error, so go to a locus or gene first, and going to the whole-genome view hides it. ${REPLY}`,
    inputSchema: {
      show: z.boolean().describe('True to show the centre line, false to hide it'),
    },
    commandType: 'set_centre_line',
  },
  {
    name: 'set_controls',
    title: 'Show or hide the controls',
    description: `Show or hide igv-bot's controls: the navigation bar, and the Shareable URL where igv-bot shows one. The navigation bar is igv.js's own, with its locus box and its buttons; the Shareable URL is in a strip with a copy button. They are hidden and shown together, and start hidden; the genome browser takes the space they leave. The Session summary says whether they are showing, as controls; the user also hides and shows them by hand, with the button above the genome browser. Showing them does not change the view, and the Shareable URL is the same either way. ${REPLY}`,
    inputSchema: {
      show: z.boolean().describe('True to show the controls, false to hide them'),
    },
    commandType: 'set_controls',
  },
  {
    name: 'read_session_summary',
    title: 'Read the Session summary',
    description:
      'Read what igv-bot is showing now, without changing anything: genome, loci, tracks in display order with name, type, URL and height, and whether the crosshairs, centre line and controls are showing. The user also changes igv-bot by hand (panning, zooming, reordering, resizing or removing tracks) and you are not told when they do. Call this before describing the view or acting on a reference to it, such as "this region" or "the second track", unless a reply from another igv-bot tool has just given you the Session summary.',
    inputSchema: {},
    commandType: 'read_session_summary',
  },
  {
    name: 'get_shareable_url',
    title: 'Get the Shareable URL',
    description: `Get a Shareable URL for what igv-bot is showing now: a link that opens the same genome, loci and tracks in igv-webapp, the IGV web application at igv.org, for anyone the user sends it to. Use this when the user asks for a link to share, send or keep. The link carries the whole Session in itself, so it is long, needs no igv-bot and no Room, and does not expire; it shows the view as it is now, so get a new one after the view changes. Give the user the link exactly as it is in the reply, whole and unshortened. It is not the Join link, which opens igv-bot itself: never give one for the other. The user can copy the same link from igv-bot once the controls are shown. Nothing in igv-bot changes. The reply is the Shareable URL on a line of its own, then the Session summary of the view it opens.`,
    inputSchema: {},
    commandType: 'get_shareable_url',
  },
]
