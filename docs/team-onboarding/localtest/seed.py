#!/usr/bin/env python3
# 依正式庫查詢 ②（prod_snapshot_q2.sql）產生本機測試資料：館別、AM 勾選、各館 hotel_admin
import re, uuid, sys

src = open(sys.argv[1], encoding="utf-8-sig").read()
rows = re.findall(r"\('([^']*)', ([tf]), (\d+), (NULL|'[^']*'), (NULL|'[^']*')\)", src)

ns = uuid.UUID("00000000-0000-0000-0000-000000000000")
uid = lambda k: str(uuid.uuid5(ns, k))
AMS = {"Bella 王苑婷": "am", "Elaine 郭天妍(天天)": "am", "Synn 関詠心(心心)": "am", "Ken 郭天銳": "am_manager"}
NEVER_SOLD = {"測試館-上架引導"}

people, out = {}, []
for name, active, _, am_list, ha_list in rows:
    acc = uid("acc:" + name)
    fa = "NULL" if name in NEVER_SOLD else "'2026-01-01'"
    out.append(f"INSERT INTO accommodation_info (id, name, is_active, first_activated_at) VALUES ('{acc}', '{name}', {active == 't'}, {fa});")
    for who in ([] if ha_list == "NULL" else ha_list.strip("'").split("、")):
        people.setdefault(who, {"acc": [], "am": []})["acc"].append(acc)
    for who in ([] if am_list == "NULL" else am_list.strip("'").split("、")):
        people.setdefault(who, {"acc": [], "am": []})["am"].append(acc)

for who, d in people.items():
    u = who if re.fullmatch(r"[0-9a-f-]{36}", who) else uid("user:" + who)
    if u == who:
        pass
    else:
        arr = "NULL" if not d["am"] else "ARRAY[" + ",".join(f"'{a}'" for a in d["am"]) + "]::uuid[]"
        out.append(f"INSERT INTO team_member_profiles (id, user_id, display_name, is_active, am_managed_accommodation_ids) VALUES ('{uid('profile:' + who)}', '{u}', '{who}', true, {arr});")
        if who in AMS:
            out.append(f"INSERT INTO user_roles (user_id, accommodation_id, role) VALUES ('{u}', NULL, '{AMS[who]}');")
    for a in d["acc"]:
        out.append(f"INSERT INTO user_roles (user_id, accommodation_id, role) VALUES ('{u}', '{a}', 'hotel_admin');")

print("\n".join(out))
