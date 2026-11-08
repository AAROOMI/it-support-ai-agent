import json
import logging
from pathlib import Path
from typing import Optional

from livekit.agents import RunContext, ToolError, function_tool, get_job_context

logger = logging.getLogger("burger-agent")

# Load menu data
MENU_PATH = Path(__file__).parent / "data" / "menu.json"
MENU_DATA = json.loads(MENU_PATH.read_text()) if MENU_PATH.exists() else {"categories": []}

# In-memory cart per session (stored in a module-level dict keyed by job)
_carts: dict[str, list] = {}


def _get_cart(job_id: str) -> list:
    return _carts.setdefault(job_id, [])


def _cart_total(cart: list) -> float:
    return sum((item["price"] + item["extras_price"]) * item["quantity"] for item in cart)


@function_tool()
async def get_menu(context: RunContext) -> str:
    """Get the full menu with categories and items. Returns item names, prices, and categories."""
    lines = []
    for cat in MENU_DATA.get("categories", []):
        lines.append(f"\n## {cat['name']}")
        for p in cat.get("products", []):
            if p.get("soldOut"):
                lines.append(f"  - {p['name']}: {p['price']} SAR (SOLD OUT)")
            else:
                lines.append(f"  - {p['name']}: {p['price']} SAR ({p.get('calories', '?')} cal)")
                if p.get("extras"):
                    for e in p["extras"]:
                        mod_names = ", ".join(m["name"] for m in e.get("modifiers", []))
                        if mod_names:
                            lines.append(f"    Add-ons: {mod_names} (up to {e['max']})")
    return "\n".join(lines)


@function_tool()
async def search_menu(context: RunContext, query: str) -> str:
    """Search the menu for items matching a query.

    Args:
        query: Search term (e.g., "burger", "fries", "cola", "sauce")
    """
    results = []
    q = query.lower()
    for cat in MENU_DATA.get("categories", []):
        for p in cat.get("products", []):
            if q in p["name"].lower() or q in (p.get("description") or "").lower():
                status = " (SOLD OUT)" if p.get("soldOut") else ""
                results.append(f"  - {p['name']}: {p['price']} SAR{status} [{cat['name']}]")
    if not results:
        return f"No items found matching '{query}'."
    return "Matching items:\n" + "\n".join(results)


@function_tool()
async def get_item_details(context: RunContext, item_name: str) -> str:
    """Get detailed info about a menu item including available add-ons/extras.

    Args:
        item_name: Name of the menu item (e.g., "Classic Double Burger")
    """
    for cat in MENU_DATA.get("categories", []):
        for p in cat.get("products", []):
            if p["name"].lower() == item_name.lower():
                lines = [
                    f"{p['name']}",
                    f"Price: {p['price']} SAR",
                    f"Calories: {p.get('calories', 'N/A')}",
                    f"Category: {cat['name']}",
                ]
                if p.get("description"):
                    lines.append(f"Description: {p['description']}")
                if p.get("extras"):
                    for e in p["extras"]:
                        lines.append(f"\nAdd-ons (choose up to {e['max']}):")
                        for m in e.get("modifiers", []):
                            lines.append(f"  - {m['name']}: +{m['price']} SAR")
                if p.get("soldOut"):
                    lines.append("STATUS: SOLD OUT")
                return "\n".join(lines)
    return f"Item '{item_name}' not found on the menu."



async def _notify_frontend(notification_type: str, **payload) -> None:
    """Send an RPC notification to the browser to update the UI."""
    try:
        room = get_job_context().room
        if not room.remote_participants:
            return
        participant_identity = next(iter(room.remote_participants))
        await room.local_participant.perform_rpc(
            destination_identity=participant_identity,
            method="client.showNotification",
            payload=json.dumps({"type": notification_type, **payload}),
            response_timeout=10.0,
        )
    except Exception as e:
        logger.debug("RPC notification skipped: %s", e)


@function_tool()
async def add_to_cart(
    context: RunContext,
    item_name: str,
    quantity: int = 1,
    extras: Optional[str] = None,
    special_request: Optional[str] = None,
) -> str:
    """Add an item to the cart.

    Args:
        item_name: Name of the menu item to add
        quantity: Number of items (default 1)
        extras: Comma-separated list of add-on names (e.g., "Cheese Slice, Bacon")
        special_request: Any special request (e.g., "no onions", "extra sauce")
    """
    # Find the item
    found = None
    for cat in MENU_DATA.get("categories", []):
        for p in cat.get("products", []):
            if p["name"].lower() == item_name.lower():
                found = p
                break
        if found:
            break

    if not found:
        return f"Item '{item_name}' not found on the menu. Please check the name."

    if found.get("soldOut"):
        return f"Sorry, {item_name} is currently sold out. Would you like something else?"

    # Calculate extras price
    extras_list = []
    extras_price = 0.0
    if extras:
        for extra_name in [e.strip() for e in extras.split(",")]:
            for e in found.get("extras", []):
                for m in e.get("modifiers", []):
                    if m["name"].lower() == extra_name.lower():
                        extras_list.append(m["name"])
                        extras_price += m["price"]

    # Get job context for cart key
    try:
        job_id = get_job_context().job.id
    except Exception:
        job_id = "default"

    cart = _get_cart(job_id)
    item_entry = {
        "name": found["name"],
        "price": found["price"],
        "quantity": quantity,
        "extras": extras_list,
        "extras_price": extras_price,
        "special_request": special_request,
        "line_total": (found["price"] + extras_price) * quantity,
    }
    cart.append(item_entry)

    total = _cart_total(cart)
    extras_str = f" with {', '.join(extras_list)}" if extras_list else ""
    req_str = f" (Note: {special_request})" if special_request else ""

    # Notify frontend
    await _notify_frontend("item_added", item=found["name"], cart=cart)

    return (
        f"Added {quantity}x {found['name']}{extras_str}{req_str} to your cart. "
        f"Line total: {(found['price'] + extras_price) * quantity:.2f} SAR. "
        f"Cart total so far: {total:.2f} SAR."
    )


@function_tool()
async def view_cart(context: RunContext) -> str:
    """View the current cart with all items and total price."""
    try:
        job_id = get_job_context().job.id
    except Exception:
        job_id = "default"
    cart = _get_cart(job_id)
    if not cart:
        return "Your cart is empty. What would you like to order?"

    lines = ["Your cart:"]
    for i, item in enumerate(cart, 1):
        extras = f" ({', '.join(item['extras'])})" if item["extras"] else ""
        req = f" [Note: {item['special_request']}]" if item.get("special_request") else ""
        lines.append(
            f"  {i}. {item['quantity']}x {item['name']}{extras}{req} - {item['line_total']:.2f} SAR"
        )
    lines.append(f"\nTotal: {_cart_total(cart):.2f} SAR")
    return "\n".join(lines)


@function_tool()
async def remove_from_cart(context: RunContext, item_name: str) -> str:
    """Remove an item from the cart.

    Args:
        item_name: Name of the item to remove
    """
    try:
        job_id = get_job_context().job.id
    except Exception:
        job_id = "default"
    cart = _get_cart(job_id)
    original_len = len(cart)
    _carts[job_id] = [item for item in cart if item["name"].lower() != item_name.lower()]
    if len(_carts[job_id]) == original_len:
        return f"'{item_name}' not found in your cart."
    return f"Removed {item_name} from your cart. Cart total: {_cart_total(_carts[job_id]):.2f} SAR."


@function_tool()
async def clear_cart(context: RunContext) -> str:
    """Clear all items from the cart."""
    try:
        job_id = get_job_context().job.id
    except Exception:
        job_id = "default"
    _carts[job_id] = []
    return "Cart cleared. What would you like to order?"


@function_tool()
async def checkout(context: RunContext) -> str:
    """Finalize the order and provide a checkout summary with a link to complete payment."""
    try:
        job_id = get_job_context().job.id
    except Exception:
        job_id = "default"
    cart = _get_cart(job_id)
    if not cart:
        return "Your cart is empty. Please add items before checking out."

    lines = ["Here's your order summary:"]
    for item in cart:
        extras = f" with {', '.join(item['extras'])}" if item["extras"] else ""
        req = f" (Note: {item['special_request']})" if item.get("special_request") else ""
        lines.append(f"  - {item['quantity']}x {item['name']}{extras}{req}: {item['line_total']:.2f} SAR")
    lines.append(f"\nTotal: {_cart_total(cart):.2f} SAR")
    lines.append("\nTo complete your order and pay, please visit:")
    lines.append("https://order.qoodz.app/menu/2260?table=7549&pickupType=pickup&branch=2545")

    await _notify_frontend("checkout_ready", url="https://order.qoodz.app/menu/2260?table=7549&pickupType=pickup&branch=2545", cart=cart)
    lines.append("\nYour items are ready to be added to your cart on the website. Is there anything else I can help with?")
    return "\n".join(lines)
