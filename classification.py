import re
from pathlib import Path
from datetime import datetime

import pandas as pd # type: ignore

# =========================================================
# 1) CONFIG – CHANGE THESE FOR LATER MONTHS
# =========================================================
CHAT_FILE = r"_chat.txt"   # WhatsApp export path

DATE_FORMAT = "%d/%m/%Y, %I:%M:%S %p"     # adjust if your export is different

# Problem categories and Arabic/English keywords
CATEGORY_KEYWORDS = {
    "PRINT_INVOICE": [
        "لا تطبع", "لا يطبع", "لا يمكن الطباعه", "عرض سعر لا يطبع",
        "ترحيل", "لا يمكن طباعه", "الطباعة"
    ],
    "PRINTERS": [
        "طابعة", "printer", "طباعه", "print"
    ],
    "NETWORK": [
        "النت ضعيف", "النت لا يعمل", "الانترنت لا يعمل", "انقطع الانترنت",
        "internet", "الشبكة لا تعمل", "الشبكة مش رابطة", 
    ],
    "DISCOUNT": [
        "الخصم", "نسبة الخصم"
    ],
    "POS": [
        "جهاز الدفع", "POS", "شبكة السحب", "خدمة سداد", "امازون",
        "apple pay", "تابي", "payfort", "الدفع" ,"نقطة البيع", "نقط البيع"
    ],
    "CREDIT_LIMIT": [
        "Credit limit", "كريدت", "بلوك", "limit"
    ],
    "RETURN": [
        "ارجاع", "مرتجع","استبدال"
    ],
    "ERP": [
        "الساب لا يفتح", "SAP لا يفتح", "SAB لا يعمل", "السيستم معطل",
        "الفيوري لا يعمل", "مشكلـة بالفيوري", "VA01", "VA02", "SAP", "SAB", "الفيوري", "فيوري"
    ],
}

# Showrooms dictionary – normalize names
SHOWROOM_PATTERNS = {
    "المزاحمية": ["معرض المزاحمية", "المزاحمية"],
    "النرجس": ["معرض النرجس", "فرع النرجس"],
    "الملز": ["معرض الملز", "فرع الملز"],
    "لبن": ["معرض لبن"],
    "طريق الخرج": ["فرع طريق الخرج", "طريق الخرج"],
    "الروضة": ["معرض الروضة", "الروضة"],
    "لاكجيريا": ["لاكجيريا", "Luxeria"],
    "القيروان": ["معرض القيروان", "القيروان"],
}

# Keywords to consider as “disconnection / network problem”
DISCONNECTION_KEYWORDS = [
    "النت لا يعمل", "النت ضعيف", "انقطع الانترنت", "الانترنت لا يعمل",
    "الشبكة لا تعمل", "internet لا يعمل", "انقطع التيار الكهربائي", "الإنترنت بطيء"
]

# Regex for extension/mobile “call” messages
EXT_REGEX = re.compile(r"\b8\d{3}\b")     # 4-digit extensions like 8773, 8850, 8624
MOBILE_REGEX = re.compile(r"\b05\d{8}\b") # KSA mobiles like 05xxxxxxxx

# =========================================================
# 2) PARSE WHATSAPP CHAT
# =========================================================
MSG_PATTERN = re.compile(
    r"^\[(\d{2}/\d{2}/\d{4}),\s+(\d{1,2}:\d{2}:\d{2})[^\]]*\]\s+([^:]+):\s(.*)$"
)

def parse_whatsapp_chat(path: str) -> pd.DataFrame:
    """
    Parse WhatsApp export into DataFrame with:
    datetime, date, time, sender, message
    """
    rows = []
    current = None

    for line in Path(path).read_text(encoding="utf-8", errors="ignore").splitlines():
        match = MSG_PATTERN.match(line)
        if match:
            # start of new message
            if current:
                rows.append(current)
            d, t, sender, msg = match.groups()

            # try parse datetime
            dt = datetime.strptime(f"{d}, {t}", "%d/%m/%Y, %H:%M:%S")
            current = {
                "datetime": dt,
                "date": dt.date(),
                "time": dt.time(),
                "sender": sender.strip(),
                "message": msg.strip(),
            }
        else:
            # continuation of previous message
            if current:
                current["message"] += "\n" + line.strip()

    if current:
        rows.append(current)

    df = pd.DataFrame(rows)
    return df

# =========================================================
# 3) CLASSIFICATION HELPERS
# =========================================================
def classify_categories(text: str) -> list:
    text_low = text.lower()
    cats = []
    for cat, kw_list in CATEGORY_KEYWORDS.items():
        for kw in kw_list:
            if kw.lower() in text_low:
                cats.append(cat)
                break
    return cats

def extract_showroom(text: str) -> str | None:
    text_low = text.lower()
    for showroom, patterns in SHOWROOM_PATTERNS.items():
        for p in patterns:
            if p.lower() in text_low:
                return showroom
    return None

def is_call_message(text: str) -> bool:
    txt = text.replace(" ", "")
    return bool(EXT_REGEX.search(txt) or MOBILE_REGEX.search(txt))

def is_disconnection_issue(text: str) -> bool:
    text_low = text.lower()
    return any(kw.lower() in text_low for kw in DISCONNECTION_KEYWORDS)

# =========================================================
# 4) MAIN ANALYSIS
# =========================================================
def main():
    df = parse_whatsapp_chat(CHAT_FILE)

    # classify categories
    df["categories"] = df["message"].fillna("").apply(classify_categories)

    # showroom
    df["showroom"] = df["message"].fillna("").apply(extract_showroom)

    # calls
    df["is_call"] = df["message"].fillna("").apply(is_call_message)

    # disconnection / network issues
    df["is_disconnection"] = df["message"].fillna("").apply(is_disconnection_issue)

    # 4.1 number of messages per day
    msgs_per_day = df.groupby("date").size().rename("messages_count").reset_index()

    # 4.2 problem types per day (explode multi-label)
    exploded = df.explode("categories")
    exploded = exploded[exploded["categories"].notna()]
    problems_per_day = (
        exploded.groupby(["date", "categories"])
        .size()
        .rename("count")
        .reset_index()
    )

    # 4.3 average number of calls (per day)
    calls_per_day = df[df["is_call"]].groupby("date").size()
    avg_calls_per_day = calls_per_day.mean() if not calls_per_day.empty else 0

    # 4.4 top 3 showrooms with disconnections
    dis_df = df[df["is_disconnection"] & df["showroom"].notna()]
    top_showrooms = (
        dis_df.groupby("showroom").size().rename("disconnection_count").sort_values(ascending=False)
    )
    top3_showrooms = top_showrooms.head(3).reset_index()

    # =====================================================
    # EXPORT TO EXCEL / CSV FOR YOUR REPORT
    # =====================================================
    msgs_per_day.to_excel("central_nov_msgs_per_day.xlsx", index=False)
    problems_per_day.to_excel("central_nov_problems_per_day.xlsx", index=False)
    top3_showrooms.to_excel("central_nov_top3_disconnections.xlsx", index=False)

    # quick print summary
    print("Messages per day:")
    print(msgs_per_day)

    print("\nAverage calls per day:", avg_calls_per_day)

    print("\nTop 3 showrooms (disconnections):")
    print(top3_showrooms)


if __name__ == "__main__":
    main()
