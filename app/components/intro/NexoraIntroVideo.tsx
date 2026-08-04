import React from "react";

import { VideoIntro } from "@/components/startup/VideoIntro";

type NexoraIntroVideoProps = {
  onDone: () => void;
};

/** Legacy wrapper — intro is now the CINELOG branded startup animation. */
export function NexoraIntroVideo({ onDone }: NexoraIntroVideoProps) {
  return <VideoIntro onFinish={onDone} />;
}
