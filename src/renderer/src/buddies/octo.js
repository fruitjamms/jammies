import eggImg from "../../../assets/egg/egg.png";
import octoImg from "../../../assets/octo/octo.png";
import octoTalkImg from "../../../assets/octo/octo_talk.png";

const octo = {
  egg: {
    src: eggImg,
    frames: 6,
    idleFrames: [0, 1],
    idleMs: 350,
    hatchSequence: [0, 1, 0, 1, 0, 1, 2, 3, 2, 3, 1, 0, 4, 5],
    hatchMs: 200,
    clicksToHatch: 5,
  },
  states: {
    idle: { src: octoImg, frames: 2, ms: 600 },
    talking: { src: octoTalkImg, frames: 2, ms: 200 },
  },
};

export default octo;
