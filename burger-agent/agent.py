import asyncio
import logging
import os

from dotenv import load_dotenv
from livekit import agents
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    AudioConfig,
    BackgroundAudioPlayer,
    BuiltinAudioClip,
    room_io,
)
from livekit.plugins import ai_coustics, google

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
        ),
    )

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
