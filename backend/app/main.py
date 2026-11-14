
import os
import re
import json
import uuid
from pathlib import Path
from datetime import date, datetime, timezone
from typing import List, Optional

import joblib
import pandas as pd

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator


# --------------------------------------------------
# CONFIGURATION
# --------------------------------------------------

load_dotenv()

BASE_DIR = Path(__file__).resolve().parents[1]

DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

DATABASE_FILE = DATA_DIR / "mothers_hut_data.json"

PROJECT_ROOT = BASE_DIR.parent

DEFAULT_MODEL_PATH = PROJECT_ROOT / "ml" / "models" / "kmeans_pipeline.joblib"

MODEL_ARTIFACT_PATH = Path(
    os.getenv("MODEL_ARTIFACT_PATH", str(DEFAULT_MODEL_PATH))
)

SHEETS_WEBHOOK_SECRET = os.getenv("SHEETS_WEBHOOK_SECRET", "")

CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000"
    ).split(",")
    if origin.strip()
]


# --------------------------------------------------
# FASTAPI APPLICATION
# --------------------------------------------------

app = FastAPI(
    title="Mother's Hut Intelligence API",
    description="Customer intelligence and segmentation backend",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------
# LOCAL JSON DATABASE
# --------------------------------------------------

EMPTY_DATABASE = {
    "customers": [],
    "orders": [],
    "campaigns": [],
    "campaign_recipients": [],
    "birthday_campaigns": [],
    "customer_clusters": [],
    "processing_logs": []
}


def load_database():
    """Load local JSON database."""

    if not DATABASE_FILE.exists():
        save_database(EMPTY_DATABASE.copy())

    try:
        with open(DATABASE_FILE, "r", encoding="utf-8") as file:
            data = json.load(file)

        for key, default_value in EMPTY_DATABASE.items():
            data.setdefault(key, default_value.copy())

        return data

    except (json.JSONDecodeError, OSError):
        raise HTTPException(
            status_code=500,
            detail="Unable to read local database file."
        )


def save_database(data):
    """Save database safely using an atomic file replacement."""

    temporary_file = DATABASE_FILE.with_suffix(".tmp")

    with open(temporary_file, "w", encoding="utf-8") as file:
        json.dump(data, file, indent=4, ensure_ascii=False)

    os.replace(temporary_file, DATABASE_FILE)


def add_processing_log(data, event_type, reference_id, status, details):
    data["processing_logs"].append({
        "id": str(uuid.uuid4()),
        "event_type": event_type,
        "reference_id": reference_id,
        "status": status,
        "details": details,
        "created_at": datetime.now(timezone.utc).isoformat()
    })


# --------------------------------------------------
# REQUEST MODELS
# --------------------------------------------------

class SheetOrderPayload(BaseModel):

    order_id: str = Field(..., min_length=2)
    customer_id: str = Field(..., min_length=2)
    customer_name: str = Field(..., min_length=1)

    contact_no: str = Field(..., min_length=10, max_length=15)

    dob: Optional[str] = None
    age: Optional[int] = Field(default=None, ge=0, le=120)
    gender: Optional[str] = "Prefer not to say"

    order_date: str
    order_amount: float = Field(..., ge=0)

    group_size: int = Field(default=1, ge=1)
    children_count: int = Field(default=0, ge=0)

    discount_used: bool = False

    food_categories: str
    dish_name: str

    rating: Optional[float] = Field(default=None, ge=1, le=5)

    day_type: Optional[str] = "Weekend"
    meal_time: Optional[str] = "Dinner"
    order_channel: Optional[str] = "Dine-In"

    order_status: str = "READY"

    @field_validator("contact_no")
    @classmethod
    def validate_phone(cls, value):

        digits = re.sub(r"\D", "", value)

        if len(digits) < 10:
            raise ValueError("Phone number must contain at least 10 digits.")

        return digits[-10:]


class SimulateCampaignRequest(BaseModel):

    campaign_name: str

    campaign_type: str = Field(
        ...,
        pattern="^(cluster|birthday|alert|bulk_alert)$"
    )

    cluster_id: Optional[int] = None

    message_content: str = Field(..., min_length=5)

    language: str = "en"

    recipient_ids: List[str] = Field(..., min_length=1)

    birthday_occurrence: Optional[str] = None
    offer_id: Optional[str] = None

    allow_resend: bool = False


# --------------------------------------------------
# ROOT AND HEALTH ENDPOINTS
# --------------------------------------------------

@app.get("/")
def root():

    return {
        "application": "Mother's Hut Intelligence API",
        "status": "running",
        "storage": "Local JSON",
        "database": "Connected",
        "demo_sms_mode": True,
        "supabase": False
    }


@app.get("/api/health")
def health():

    return {
        "status": "ok",
        "backend": "FastAPI",
        "storage": "Local JSON",
        "demo_sms_mode": True
    }


@app.get("/api/database/status")
def database_status():

    return {
        "status": "connected",
        "database_file": str(DATABASE_FILE),
        "storage_type": "JSON"
    }


# --------------------------------------------------
# BIRTHDAY CALCULATION
# --------------------------------------------------

def compute_next_birthday(
    dob_str: Optional[str],
    today: Optional[date] = None
):

    if not dob_str:
        return {
            "has_valid_dob": False,
            "days_remaining": None,
            "next_birthday": None
        }

    try:
        dob = date.fromisoformat(dob_str[:10])

    except ValueError:
        return {
            "has_valid_dob": False,
            "days_remaining": None,
            "next_birthday": None
        }

    reference_date = today or date.today()

    month = dob.month
    day = dob.day

    def safe_date(year):

        if month == 2 and day == 29:

            is_leap = (
                year % 4 == 0
                and (year % 100 != 0 or year % 400 == 0)
            )

            return date(year, 2, 29 if is_leap else 28)

        return date(year, month, day)

    candidate = safe_date(reference_date.year)

    if candidate < reference_date:
        candidate = safe_date(reference_date.year + 1)

    days_remaining = (candidate - reference_date).days

    return {
        "has_valid_dob": True,
        "days_remaining": days_remaining,
        "next_birthday": candidate.isoformat(),
        "is_today": days_remaining == 0
    }


@app.get("/api/birthdays")
def get_birthdays():

    data = load_database()

    result = []

    for customer in data["customers"]:

        birthday = compute_next_birthday(customer.get("dob"))

        if birthday["has_valid_dob"]:

            result.append({
                **customer,
                **birthday
            })

    result.sort(
        key=lambda item: item["days_remaining"]
    )

    return {
        "total": len(result),
        "birthdays": result
    }


# --------------------------------------------------
# K-MEANS CUSTOMER CLUSTER PREDICTION
# --------------------------------------------------

def predict_customer_cluster(customer: dict):

    if not MODEL_ARTIFACT_PATH.exists():

        return {
            "cluster_id": 0,
            "model_version": "fallback"
        }

    try:

        bundle = joblib.load(MODEL_ARTIFACT_PATH)

        model = bundle["model"]
        scaler = bundle["scaler"]
        columns = bundle["feature_columns"]

        food_categories = [
            "chicken_orders",
            "veg_orders",
            "mutton_orders",
            "seafood_orders",
            "biryani_rice_orders",
            "chinese_fastfood_orders",
            "dessert_beverage_orders"
        ]

        total_food = max(
            1,
            sum(
                int(customer.get(key, 0) or 0)
                for key in food_categories
            )
        )

        visits = max(
            1,
            int(customer.get("total_visits", 1) or 1)
        )

        last_visit = customer.get("last_visit_date")

        try:
            days_since = (
                date.today() - date.fromisoformat(last_visit[:10])
            ).days if last_visit else 15

        except ValueError:
            days_since = 15

        row = {

            "age": customer.get("age") or 30,

            "total_visits": visits,

            "total_spend_inr": float(
                customer.get("total_spend_inr", 0) or 0
            ),

            "avg_spend_per_visit_inr": float(
                customer.get("avg_spend_per_visit_inr", 0) or 0
            ),

            "avg_group_size": float(
                customer.get("avg_group_size", 1) or 1
            ),

            "total_children": int(
                customer.get("total_children", 0) or 0
            ),

            "discount_rate": float(
                customer.get("discount_used_count", 0) or 0
            ) / visits,

            "days_since_last_visit": max(0, days_since),

            "avg_rating_given": float(
                customer.get("avg_rating_given") or 4.2
            ),

            "chicken_share": int(
                customer.get("chicken_orders", 0) or 0
            ) / total_food,

            "veg_share": int(
                customer.get("veg_orders", 0) or 0
            ) / total_food,

            "mutton_share": int(
                customer.get("mutton_orders", 0) or 0
            ) / total_food,

            "seafood_share": int(
                customer.get("seafood_orders", 0) or 0
            ) / total_food,

            "biryani_rice_share": int(
                customer.get("biryani_rice_orders", 0) or 0
            ) / total_food,

            "chinese_fastfood_share": int(
                customer.get("chinese_fastfood_orders", 0) or 0
            ) / total_food,

            "dessert_beverage_share": int(
                customer.get("dessert_beverage_orders", 0) or 0
            ) / total_food
        }

        X = pd.DataFrame([row])[columns]

        X_scaled = scaler.transform(X)

        cluster_id = int(model.predict(X_scaled)[0])

        return {
            "cluster_id": cluster_id,
            "model_version": bundle.get("model_version", "v1")
        }

    except Exception as error:

        print("K-Means prediction error:", str(error))

        return {
            "cluster_id": 0,
            "model_version": "fallback"
        }


# --------------------------------------------------
# CUSTOMER AND ORDER APIs
# --------------------------------------------------

@app.get("/api/customers")
def get_customers():

    data = load_database()

    return {
        "total": len(data["customers"]),
        "customers": data["customers"]
    }


@app.get("/api/customers/{customer_id}")
def get_customer(customer_id: str):

    data = load_database()

    customer = next(
        (
            item for item in data["customers"]
            if item["customer_id"] == customer_id
        ),
        None
    )

    if not customer:
        raise HTTPException(
            status_code=404,
            detail="Customer not found."
        )

    return customer


@app.get("/api/orders")
def get_orders():

    data = load_database()

    return {
        "total": len(data["orders"]),
        "orders": data["orders"]
    }


# --------------------------------------------------
# GOOGLE SHEETS ORDER SYNC
# --------------------------------------------------

@app.post("/api/sheets/order-sync")
def sync_google_sheet_order(
    payload: SheetOrderPayload,
    x_sheets_secret: Optional[str] = Header(default=None)
):

    if (
        SHEETS_WEBHOOK_SECRET
        and x_sheets_secret != SHEETS_WEBHOOK_SECRET
    ):

        raise HTTPException(
            status_code=401,
            detail="Invalid Google Sheets webhook secret."
        )

    data = load_database()

    # Check duplicate orders

    existing_order = next(
        (
            order for order in data["orders"]
            if order["order_id"] == payload.order_id
        ),
        None
    )

    if existing_order:

        add_processing_log(
            data,
            "SHEETS_ORDER_SYNC",
            payload.order_id,
            "DUPLICATE_SKIPPED",
            {"reason": "Order ID already processed"}
        )

        save_database(data)

        return {
            "status": "DUPLICATE_SKIPPED",
            "order_id": payload.order_id
        }

    # Find or create customer

    customer = next(
        (
            item for item in data["customers"]
            if item["customer_id"] == payload.customer_id
        ),
        None
    )

    if not customer:

        customer = {

            "customer_id": payload.customer_id,

            "customer_name": payload.customer_name,

            "contact_no": payload.contact_no,

            "age": payload.age,

            "dob": payload.dob,

            "gender": payload.gender,

            "first_visit_date": payload.order_date,

            "last_visit_date": payload.order_date
        }

        data["customers"].append(customer)

    else:

        if payload.dob:
            customer["dob"] = payload.dob

        if payload.age is not None:
            customer["age"] = payload.age

        customer["customer_name"] = payload.customer_name
        customer["contact_no"] = payload.contact_no
        customer["gender"] = payload.gender

    # Store order

    order = {

        "order_id": payload.order_id,

        "customer_id": payload.customer_id,

        "order_date": payload.order_date,

        "order_amount": payload.order_amount,

        "group_size": payload.group_size,

        "children_count": payload.children_count,

        "discount_used": payload.discount_used,

        "food_categories": payload.food_categories,

        "dish_name": payload.dish_name,

        "rating": payload.rating,

        "day_type": payload.day_type,

        "meal_time": payload.meal_time,

        "order_channel": payload.order_channel,

        "order_status": payload.order_status,

        "processing_status": "PROCESSED"
    }

    data["orders"].append(order)

    # Aggregate customer history

    all_orders = [
        item for item in data["orders"]
        if item["customer_id"] == payload.customer_id
    ]

    total_visits = len(all_orders)

    total_spend = sum(
        float(item["order_amount"])
        for item in all_orders
    )

    avg_spend = round(
        total_spend / max(1, total_visits),
        2
    )

    avg_group = round(
        sum(int(item["group_size"]) for item in all_orders)
        / max(1, total_visits),
        2
    )

    total_children = sum(
        int(item["children_count"])
        for item in all_orders
    )

    discounts = sum(
        1 for item in all_orders
        if item["discount_used"]
    )

    ratings = [
        float(item["rating"])
        for item in all_orders
        if item["rating"] is not None
    ]

    avg_rating = (
        round(sum(ratings) / len(ratings), 2)
        if ratings else None
    )

    # Food preference counts

    category_counts = {

        "chicken_orders": 0,
        "veg_orders": 0,
        "mutton_orders": 0,
        "seafood_orders": 0,
        "biryani_rice_orders": 0,
        "chinese_fastfood_orders": 0,
        "dessert_beverage_orders": 0
    }

    dish_frequency = {}

    for item in all_orders:

        categories = (
            item.get("food_categories") or ""
        ).lower()

        if "chicken" in categories:
            category_counts["chicken_orders"] += 1

        if "veg" in categories:
            category_counts["veg_orders"] += 1

        if "mutton" in categories:
            category_counts["mutton_orders"] += 1

        if "seafood" in categories:
            category_counts["seafood_orders"] += 1

        if "biryani" in categories or "rice" in categories:
            category_counts["biryani_rice_orders"] += 1

        if "chinese" in categories or "fast" in categories:
            category_counts["chinese_fastfood_orders"] += 1

        if "dessert" in categories or "beverage" in categories:
            category_counts["dessert_beverage_orders"] += 1

        dish = item.get("dish_name", "")

        dish_frequency[dish] = (
            dish_frequency.get(dish, 0) + 1
        )

    most_ordered_dish = (
        max(dish_frequency, key=dish_frequency.get)
        if dish_frequency else payload.dish_name
    )

    dates = sorted(
        item["order_date"][:10]
        for item in all_orders
    )

    # Update customer

    updated_fields = {

        "customer_name": payload.customer_name,

        "contact_no": payload.contact_no,

        "age": payload.age if payload.age is not None else customer.get("age"),

        "dob": payload.dob or customer.get("dob"),

        "gender": payload.gender,

        "first_visit_date": dates[0],

        "last_visit_date": dates[-1],

        "total_visits": total_visits,

        "total_spend_inr": total_spend,

        "avg_spend_per_visit_inr": avg_spend,

        "avg_group_size": avg_group,

        "total_children": total_children,

        "discount_used_count": discounts,

        "most_ordered_dish": most_ordered_dish,

        "preferred_day_type": payload.day_type,

        "preferred_meal_time": payload.meal_time,

        "avg_rating_given": avg_rating,

        "updated_at": datetime.now(timezone.utc).isoformat(),

        **category_counts
    }

    customer.update(updated_fields)

    # Predict cluster

    prediction = predict_customer_cluster(customer)

    cluster_record = {

        "customer_id": payload.customer_id,

        "cluster_id": prediction["cluster_id"],

        "cluster_name": f"Cluster {prediction['cluster_id']}",

        "model_version": prediction["model_version"],

        "assigned_at": datetime.now(timezone.utc).isoformat()
    }

    existing_cluster = next(
        (
            item for item in data["customer_clusters"]
            if item["customer_id"] == payload.customer_id
        ),
        None
    )

    if existing_cluster:
        existing_cluster.update(cluster_record)
    else:
        data["customer_clusters"].append(cluster_record)

    customer["cluster_id"] = prediction["cluster_id"]

    add_processing_log(
        data,
        "SHEETS_ORDER_SYNC",
        payload.order_id,
        "SUCCESS",
        {
            "customer_id": payload.customer_id,
            "predicted_cluster": prediction["cluster_id"]
        }
    )

    save_database(data)

    return {

        "status": "PROCESSED",

        "order_id": payload.order_id,

        "customer_id": payload.customer_id,

        "predicted_cluster_id": prediction["cluster_id"],

        "customer_master_row": customer
    }


# --------------------------------------------------
# CAMPAIGN APIs
# --------------------------------------------------

@app.get("/api/campaigns")
def get_campaigns():

    data = load_database()

    return {
        "total": len(data["campaigns"]),
        "campaigns": data["campaigns"]
    }


@app.get("/api/campaigns/{campaign_id}/recipients")
def get_campaign_recipients(campaign_id: str):

    data = load_database()

    recipients = [
        item for item in data["campaign_recipients"]
        if item["campaign_id"] == campaign_id
    ]

    return {
        "campaign_id": campaign_id,
        "total": len(recipients),
        "recipients": recipients
    }


@app.post("/api/campaigns/simulate")
def simulate_sms_campaign(req: SimulateCampaignRequest):
    """
    DEMO MODE ONLY.

    No actual SMS, WhatsApp or external messaging gateway is called.
    """

    data = load_database()

    # Validate recipients

    customers = [
        customer for customer in data["customers"]
        if customer["customer_id"] in req.recipient_ids
    ]

    total = len(customers)

    if total == 0:

        raise HTTPException(
            status_code=404,
            detail="No valid recipients found."
        )

    # Prevent duplicate birthday campaigns

    if (
        req.campaign_type == "birthday"
        and req.birthday_occurrence
        and not req.allow_resend
    ):

        for customer in customers:

            duplicate = any(
                item["customer_id"] == customer["customer_id"]
                and item["birthday_occurrence"] == req.birthday_occurrence
                for item in data["birthday_campaigns"]
            )

            if duplicate:

                raise HTTPException(
                    status_code=409,
                    detail=(
                        "Duplicate birthday demo campaign blocked for "
                        f"{customer['customer_id']} on "
                        f"{req.birthday_occurrence}. "
                        "Authorize resend explicitly."
                    )
                )

    campaign_id = str(uuid.uuid4())

    recipients_payload = []

    delivered_count = 0
    failed_count = 0

    for index, customer in enumerate(customers):

        # Simulated delivery outcome

        is_failed = (
            index + len(customer["customer_id"])
        ) % 25 == 24

        delivery_status = (
            "Failed" if is_failed else "Delivered"
        )

        if is_failed:
            failed_count += 1
        else:
            delivered_count += 1

        # Personalize message

        personalized_message = (
            req.message_content
            .replace(
                "{customer_name}",
                customer.get("customer_name", "Customer")
            )
            .replace(
                "{most_ordered_dish}",
                customer.get("most_ordered_dish") or "our specials"
            )
        )

        recipient = {

            "campaign_id": campaign_id,

            "customer_id": customer["customer_id"],

            "customer_name": customer.get("customer_name"),

            "phone_no": customer.get("contact_no"),

            "message_content": personalized_message,

            "simulated_status": "Sent",

            "simulated_delivery_status": delivery_status,

            "demo_mode": True
        }

        recipients_payload.append(recipient)

    # Save campaign

    campaign = {

        "id": campaign_id,

        "campaign_name": req.campaign_name,

        "campaign_type": req.campaign_type,

        "cluster_id": req.cluster_id,

        "channel": "SMS",

        "message_content": req.message_content,

        "language": req.language,

        "recipient_count": total,

        "sent_count": total,

        "delivered_count": delivered_count,

        "failed_count": failed_count,

        "status": "Completed",

        "demo_mode": True,

        "created_at": datetime.now(timezone.utc).isoformat()
    }

    data["campaigns"].append(campaign)

    data["campaign_recipients"].extend(
        recipients_payload
    )

    # Record birthday campaign history

    if (
        req.campaign_type == "birthday"
        and req.birthday_occurrence
    ):

        for customer in customers:

            birthday_record = {

                "customer_id": customer["customer_id"],

                "birthday_occurrence": req.birthday_occurrence,

                "campaign_id": campaign_id,

                "offer_id": req.offer_id,

                "simulated_status": (
                    "Delivered" if delivered_count > 0 else "Failed"
                ),

                "resend_authorized": req.allow_resend
            }

            existing = next(
                (
                    item for item in data["birthday_campaigns"]
                    if item["customer_id"] == customer["customer_id"]
                    and item["birthday_occurrence"] == req.birthday_occurrence
                ),
                None
            )

            if existing:
                existing.update(birthday_record)
            else:
                data["birthday_campaigns"].append(birthday_record)

    save_database(data)

    return {

        "demo_mode_label": "DEMO MODE - SIMULATED SMS",

        "campaign_id": campaign_id,

        "sent_count": total,

        "delivered_count": delivered_count,

        "failed_count": failed_count,

        "status": "Completed",

        "demo_mode": True
    }


# --------------------------------------------------
# CUSTOMER CLUSTER API
# --------------------------------------------------

@app.get("/api/clusters")
def get_customer_clusters():

    data = load_database()

    return {
        "total": len(data["customer_clusters"]),
        "clusters": data["customer_clusters"]
    }


# --------------------------------------------------
# APPLICATION STARTUP
# --------------------------------------------------

@app.on_event("startup")
def initialize_database():

    if not DATABASE_FILE.exists():
        save_database(EMPTY_DATABASE.copy())

    print("--------------------------------------")
    print("Mother's Hut FastAPI Backend Started")
    print("Storage: Local JSON")
    print("Supabase: Disabled")
    print("SMS: Demo Mode Only")
    print(f"Database: {DATABASE_FILE}")
    print("--------------------------------------")
