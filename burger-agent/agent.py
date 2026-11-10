import asyncio
import logging
import os

from dotenv import load_dotenv
from livekit import agents
from livekit.agents import (
    APIConnectOptions,
    Agent,
    AgentServer,
    AgentSession,
    AudioConfig,
    BackgroundAudioPlayer,
    BuiltinAudioClip,
    room_io,
)
from livekit.agents.utils import images
from livekit.agents.voice.agent_session import VoiceActivityVideoSampler
from livekit.plugins import ai_coustics, bey, google

from google.genai import types as genai_types

from prompts import ORDERING_INSTRUCTIONS
from tools import (
    add_to_cart,
    checkout,
    clear_cart,
    get_item_details,
    get_menu,
    remove_from_cart,
    search_menu,
    view_cart,
)

logger = logging.getLogger("burger-agent")

load_dotenv(".env.local")


class OrderAssistant(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions=ORDERING_INSTRUCTIONS,
            tools=[
                get_menu,
                search_menu,
                get_item_details,
                add_to_cart,
                view_cart,
                remove_from_cart,
                clear_cart,
                checkout,
            ],
        )


server = AgentServer()


@server.rtc_session(agent_name=os.getenv("AGENT_NAME", "burger-agent"))
async def entrypoint(ctx: agents.JobContext):
    session = AgentSession(
        llm=google.realtime.RealtimeModel(
            model=os.getenv("GEMINI_MODEL", "gemini-3.8-live"),
            voice=os.getenv("GEMINI_VOICE", "Puck"),
            media_resolution=genai_types.MediaResolution.MEDIA_RESOLUTION_HIGH,
            image_encode_options=images.EncodeOptions(
                format="JPEG",
                quality=90,
                resize_options=images.ResizeOptions(
                    width=1536, height=1536, strategy="scale_aspect_fit"
                ),
            ),
        ),
        video_sampler=VoiceActivityVideoSampler(speaking_fps=2.0, silent_fps=1.0),
    )

    # Start the Beyond Presence avatar
    avatar_id = os.getenv("BEY_AVATAR_ID")
    if avatar_id and os.getenv("BEY_API_KEY"):
        livekit_url = os.getenv("LIVEKIT_URL", "")
        if livekit_url.startswith("https://"):
            livekit_url = "wss://" + livekit_url[len("https://"):]
        elif livekit_url.startswith("http://"):
            livekit_url = "ws://" + livekit_url[len("http://"):]
        try:
            avatar = bey.AvatarSession(avatar_id=avatar_id, conn_options=APIConnectOptions(max_retry=0, retry_interval=1.0, timeout=10.0))
            await avatar.start(session, room=ctx.room, livekit_url=livekit_url)
        except Exception as e:  # noqa: BLE001
            logger.warning("Beyond Presence avatar unavailable, continuing voice-only: %s", e)

    await session.start(
        room=ctx.room,
        agent=OrderAssistant(),
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=ai_coustics.audio_enhancement(
                    model=ai_coustics.EnhancerModel.QUAIL_VF_S
                ),
            ),
        ),
    )

    await ctx.connect()

    background_audio = BackgroundAudioPlayer(
        thinking_sound=[
            AudioConfig(BuiltinAudioClip.KEYBOARD_TYPING, volume=0.5),
        ],
    )
    await background_audio.start(room=ctx.room, agent_session=session)

    await asyncio.sleep(2)

    await session.generate_reply(
        instructions="Greet the customer warmly, introduce yourself as the ordering assistant for Stand Up Burger, and ask how you can help them today."
    )


if __name__ == "__main__":
    agents.cli.run_app(server)
