import * as audios from "./audios";
import * as configuration from "./configuration";
import * as corvo from "./corvo";
import * as corvo2 from "./corvo2";
import * as corvofull from "./corvo-full";
import * as image from "./image";
import * as language from "./language";
import * as list from "./list";
import * as p from "./youtube";
import * as ping from "./ping";
import * as pause from "./pause";
import * as resume from "./resume";
import * as song from "./generate-song";
import * as skip from "./skip";
import * as speak from "./speak";
import * as stop from "./stop";

export const commands = {
  a: audios,
  corvo,
  corvo2,
  corvofull,
  image,
  list,
  pause,
  p,
  ping,
  resume,
  song,
  skip,
  sp: speak,
  stop
};
