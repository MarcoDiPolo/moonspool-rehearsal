import { createElement, useEffect, useRef } from "react";
import { mount } from "./stand.mjs";

// Kiro Crew AppHost mounts the default React component in the dashboard tree.
export default function MoonspoolRehearsal() {
  const element = useRef(null);
  useEffect(() => mount(element.current), []);
  return createElement("div", {ref: element});
}
