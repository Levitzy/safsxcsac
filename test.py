import os, sys, re, time, json
import requests, random
from faker import Faker
from bs4 import BeautifulSoup
from fake_useragent import UserAgent
from flask import Flask, jsonify

# Initialize Flask app
app = Flask(__name__)

# Initialize utilities
ua = UserAgent()
faker = Faker()


def ugenX():
    ualist = [ua.random for _ in range(50)]
    return str(random.choice(ualist))


def fake_name():
    return faker.first_name(), faker.last_name()


def fake_password():
    random_numbers = "".join([str(random.randint(0, 9)) for _ in range(8)])
    return f"JUBIAR-{random_numbers}"


def extractor(data):
    try:
        soup = BeautifulSoup(data, "html.parser")
        form_data = {}
        for inputs in soup.find_all("input"):
            name = inputs.get("name")
            value = inputs.get("value")
            if name:
                form_data[name] = value
        return form_data
    except Exception as e:
        return {"error": str(e)}


def GetBDNumber():
    prefixes = ["013", "014", "015", "016", "017", "018", "019"]
    prefix = random.choice(prefixes)
    number = "".join([str(random.randint(0, 9)) for _ in range(8)])
    return f"{prefix}{number}"


def get_profile_url(uid):
    """Generate Facebook profile URL from user ID"""
    return f"https://www.facebook.com/profile.php?id={uid}"


def save_account(uid, passw, cookie, email, profile_url):
    # Save in ./RABBI/SUCCESS-OK.txt creating folder if necessary
    rabbi_dir = os.path.join(os.getcwd(), "RABBI")
    os.makedirs(rabbi_dir, exist_ok=True)
    filename = os.path.join(rabbi_dir, "SUCCESS-OK.txt")
    with open(filename, "a", encoding="utf-8") as f:
        f.write(f"{uid}|{passw}|{cookie}|{email}|{profile_url}\n")
    return filename


@app.route("/api/create/email=<user_provide>", methods=["GET"])
def create_account(user_provide):
    email = user_provide
    passw = fake_password()
    ses = requests.Session()

    try:
        # Get registration page
        response = ses.get(
            url="https://touch.facebook.com/reg",
            params={
                "_rdc": "1",
                "_rdr": "",
                "wtsid": "rdr_0t3qOXoIHbMS6isLw",
                "refsrc": "deprecated",
            },
        )

        # Extract form data from the registration page
        formula = extractor(response.text)
        mts = ses.get("https://touch.facebook.com").text
        m_ts = (
            re.search(r'name="m_ts" value="(.*?)"', str(mts)).group(1)
            if re.search(r'name="m_ts" value="(.*?)"', str(mts))
            else ""
        )

        # Generate random user data
        phone = GetBDNumber()
        firstname, lastname = fake_name()

        # Prepare registration payload
        payload = {
            "ccp": "2",
            "reg_instance": str(formula.get("reg_instance", "")),
            "submission_request": "true",
            "helper": "",
            "reg_impression_id": str(formula.get("reg_impression_id", "")),
            "ns": "1",
            "zero_header_af_client": "",
            "app_id": "103",
            "logger_id": str(formula.get("logger_id", "")),
            "field_names[0]": "firstname",
            "firstname": firstname,
            "lastname": lastname,
            "field_names[1]": "birthday_wrapper",
            "birthday_day": str(random.randint(1, 28)),
            "birthday_month": str(random.randint(1, 12)),
            "birthday_year": str(random.randint(1992, 2004)),
            "age_step_input": "",
            "did_use_age": "false",
            "field_names[2]": "reg_email__",
            "reg_email__": email,
            "reg_number__": phone,
            "field_names[3]": "sex",
            "sex": str(random.choice(["1", "2"])),  # 1=male, 2=female
            "preferred_pronoun": "",
            "custom_gender": "",
            "field_names[4]": "reg_passwd__",
            "name_suggest_elig": "false",
            "was_shown_name_suggestions": "false",
            "did_use_suggested_name": "false",
            "use_custom_gender": "false",
            "guid": "",
            "pre_form_step": "",
            "encpass": "#PWD_BROWSER:0:{}:{}".format(
                str(time.time()).split(".")[0], passw
            ),
            "submit": "Sign Up",
            "fb_dtsg": formula.get("fb_dtsg", ""),
            "jazoest": str(formula.get("jazoest", "")),
            "lsd": str(formula.get("lsd", "")),
            "__dyn": "1ZaaAG1mxu1oz-l0BBBzEnxG6U4a2i5U4e0C8dEc8uwcC4o2fwcW4o3Bw4Ewk9E4W0pKq0FE6S0x81vohw5Owk8aE36wqEd8dE2YwbK0iC1qw8W0k-0jG3qaw4kwbS1Lw9C0le0ue0QU",
            "__csr": "",
            "__req": "p",
            "__fmt": "1",
            "__a": "AYkiA9jnQluJEy73F8jWiQ3NTzmH7L6RFbnJ_SMT_duZcpo2yLDpuVXfU2doLhZ-H1lSX6ucxsegViw9lLO6uRx31-SpnBlUEDawD_8U7AY4kQ",
            "__user": "0",
        }

        # Set headers for registration request
        header1 = {
            "Host": "m.facebook.com",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1",
            "User-Agent": ugenX(),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
            "dnt": "1",
            "X-Requested-With": "mark.via.gp",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-User": "?1",
            "Sec-Fetch-Dest": "document",
            "dpr": "1.75",
            "viewport-width": "980",
            "sec-ch-ua": '"Android WebView";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
            "sec-ch-ua-mobile": "?1",
            "sec-ch-ua-platform": '"Android"',
            "sec-ch-ua-platform-version": '""',
            "sec-ch-ua-model": '""',
            "sec-ch-ua-full-version-list": "",
            "sec-ch-prefers-color-scheme": "dark",
            "Accept-Encoding": "gzip, deflate, br, zstd",
            "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
        }

        # Submit registration request
        reg_url = "https://www.facebook.com/reg/submit/?privacy_mutation_token=eyJ0eXBlIjowLCJjcmVhdGlvbl90aW1lIjoxNzM0NDE0OTk2LCJjYWxsc2l0ZV9pZCI6OTA3OTI0NDAyOTQ4MDU4fQ%3D%3D&multi_step_form=1&skip_suma=0&shouldForceMTouch=1"
        py_submit = ses.post(reg_url, data=payload, headers=header1)

        # Check for successful account creation
        if "c_user" in py_submit.cookies:
            uid = str(py_submit.cookies.get_dict()["c_user"])
            cookie = (";").join(
                [
                    "%s=%s" % (key, value)
                    for key, value in ses.cookies.get_dict().items()
                ]
            )

            # Generate profile URL
            profile_url = get_profile_url(uid)

            # Save account details
            save_file = save_account(uid, passw, cookie, email, profile_url)

            # Return success response
            return jsonify(
                {
                    "status": "success",
                    "message": "Account created successfully",
                    "data": {
                        "uid": uid,
                        "email": email,
                        "password": passw,
                        "cookie": cookie,
                        "profile_url": profile_url,
                        "saved_to": save_file,
                    },
                }
            )
        else:
            # Return failure response
            return (
                jsonify(
                    {
                        "status": "error",
                        "message": "Failed to create account",
                        "email": email,
                    }
                ),
                400,
            )

    except Exception as e:
        # Return exception response
        return (
            jsonify(
                {
                    "status": "error",
                    "message": f"Error creating account: {str(e)}",
                    "email": email,
                }
            ),
            500,
        )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
