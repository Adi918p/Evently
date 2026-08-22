(function () {
    const params = new URLSearchParams(window.location.search);
    const logbox = document.getElementById("logbox");
    const signbox = document.getElementById("signbox");
    const authFeedback = document.getElementById("authFeedback");
    const safeReturnTo = (() => {
        const value = params.get("returnTo");
        return value && value.startsWith("/") && !value.startsWith("//") ? value : "";
    })();

    const decodeToken = (value) => {
        try {
            const payload = value.split(".")[1];
            if (!payload) return null;
            const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
            const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
            const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
            return JSON.parse(new TextDecoder().decode(bytes));
        } catch {
            return null;
        }
    };

    const navigate = (url) => {
        if (window.EventlyTransition?.navigate) window.EventlyTransition.navigate(url);
        else window.location.href = url;
    };

    const destinationFor = (payload) => {
        if (safeReturnTo) return safeReturnTo;
        const role = String(payload?.role || "").toLowerCase();
        return role === "admin" ? "/admin/dashboard.html" : role === "organizer" ? "/dashboard.html" : "/index.html";
    };

    const setFeedback = (message = "", tone = "info") => {
        authFeedback.textContent = message;
        authFeedback.className = `auth-feedback${message ? ` is-${tone}` : ""}`;
    };

    const readJson = async (response, fallbackMessage) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.success === false) throw new Error(data.message || fallbackMessage);
        return data;
    };

    const change = (id) => {
        const showSignup = Number(id) === 0;
        logbox.hidden = showSignup;
        signbox.hidden = !showSignup;
        setFeedback("");
        window.history.replaceState(null, "", `${window.location.pathname}?mode=${showSignup ? "signup" : "login"}`);
    };
    window.change = change;

    const queryToken = params.get("token");
    let invalidQueryToken = false;
    if (queryToken) {
        const payload = decodeToken(queryToken);
        if (payload) {
            localStorage.setItem("token", queryToken);
            navigate(destinationFor(payload));
            return;
        }
        invalidQueryToken = true;
    }

    change(params.get("mode") === "signup" ? 0 : 1);
    if (invalidQueryToken) setFeedback("That sign-in link is invalid. Please try again.", "error");
    document.getElementById("showSignup").addEventListener("click", (event) => { event.preventDefault(); change(0); });
    document.getElementById("showLogin").addEventListener("click", (event) => { event.preventDefault(); change(1); });
    document.getElementById("googleLoginBtn").addEventListener("click", () => { window.location.href = "/api/auth/google"; });
    window.googleLogin = () => { window.location.href = "/api/auth/google"; };

    const loginForm = document.getElementById("loginForm");
    const loginButton = loginForm.querySelector("button[type=submit]");
    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const email = document.getElementById("email").value.trim().toLowerCase();
        const password = document.getElementById("pass").value;
        loginButton.disabled = true;
        loginButton.textContent = "Signing in…";
        setFeedback("Checking your details…", "info");
        try {
            const data = await readJson(await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password })
            }), "Unable to sign in");
            const payload = decodeToken(data.token);
            if (!payload) throw new Error("The sign-in response was invalid. Please try again.");
            localStorage.setItem("token", data.token);
            setFeedback("Signed in. Taking you to Evently…", "success");
            window.setTimeout(() => navigate(destinationFor(payload)), 160);
        } catch (error) {
            setFeedback(error.message, "error");
            loginButton.disabled = false;
            loginButton.textContent = "Login";
        }
    });

    const signupForm = document.getElementById("signupForm");
    const otpGroup = document.getElementById("otpGroup");
    const otpInput = document.getElementById("sotp");
    const resendOtpBtn = document.getElementById("resendOtpBtn");
    const signupSubmitBtn = document.getElementById("signupSubmitBtn");
    const signupNameInput = document.getElementById("sname");
    const signupEmailInput = document.getElementById("semail");
    const signupPasswordInput = document.getElementById("spassword");
    const signupConfirmPasswordInput = document.getElementById("sconfirmPassword");
    const passwordStrengthMsg = document.getElementById("passwordStrengthMsg");
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const passwordStrengthRules = [/.{8,}/, /[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/];
    let otpRequested = false;
    let resendTimer = null;

    const evaluatePasswordStrength = (password) => {
        const score = passwordStrengthRules.filter((rule) => rule.test(password)).length;
        return score === 5
            ? { label: "Strong password", color: "#72e4c7", isStrong: true }
            : score >= 3
                ? { label: "Almost there", color: "#f4c95d", isStrong: false }
                : { label: "Needs more variety", color: "#ff6b7d", isStrong: false };
    };

    const updatePasswordStrength = () => {
        const strength = evaluatePasswordStrength(signupPasswordInput.value);
        passwordStrengthMsg.textContent = `${strength.label} · use 8+ chars with upper, lower, number, and symbol.`;
        passwordStrengthMsg.style.color = strength.color;
        return strength;
    };

    const resetSignupVerificationState = () => {
        otpRequested = false;
        otpGroup.hidden = true;
        otpInput.value = "";
        otpInput.required = false;
        resendOtpBtn.hidden = true;
        resendOtpBtn.disabled = false;
        resendOtpBtn.textContent = "Resend OTP";
        if (resendTimer) window.clearInterval(resendTimer);
        signupSubmitBtn.textContent = "Sign Up";
        [signupNameInput, signupEmailInput, signupPasswordInput, signupConfirmPasswordInput].forEach((input) => { input.readOnly = false; });
        updatePasswordStrength();
    };

    const startOtpVerificationState = () => {
        otpRequested = true;
        otpGroup.hidden = false;
        otpInput.required = true;
        resendOtpBtn.hidden = false;
        signupSubmitBtn.textContent = "Verify OTP";
        [signupNameInput, signupEmailInput, signupPasswordInput, signupConfirmPasswordInput].forEach((input) => { input.readOnly = true; });
        otpInput.focus();
    };

    const startResendCooldown = () => {
        let seconds = 30;
        resendOtpBtn.disabled = true;
        resendOtpBtn.textContent = `Resend in ${seconds}s`;
        if (resendTimer) window.clearInterval(resendTimer);
        resendTimer = window.setInterval(() => {
            seconds -= 1;
            if (seconds <= 0) {
                window.clearInterval(resendTimer);
                resendOtpBtn.disabled = false;
                resendOtpBtn.textContent = "Resend OTP";
            } else resendOtpBtn.textContent = `Resend in ${seconds}s`;
        }, 1000);
    };

    signupPasswordInput.addEventListener("input", updatePasswordStrength);
    [["togglePasswordBtn", signupPasswordInput, "password"], ["toggleConfirmPasswordBtn", signupConfirmPasswordInput, "confirm password"]].forEach(([id, input, label]) => {
        document.getElementById(id).addEventListener("click", (event) => {
            const isHidden = input.type === "password";
            input.type = isHidden ? "text" : "password";
            event.currentTarget.textContent = isHidden ? "Hide" : "Show";
            event.currentTarget.setAttribute("aria-label", `${isHidden ? "Hide" : "Show"} ${label}`);
        });
    });

    signupForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const name = signupNameInput.value.trim();
        const email = signupEmailInput.value.trim().toLowerCase();
        const password = signupPasswordInput.value;
        const confirmPassword = signupConfirmPasswordInput.value;
        const otp = otpInput.value.trim();

        if (name.length < 2) return setFeedback("Please enter your full name.", "error");
        if (!emailRegex.test(email)) return setFeedback("Please enter a valid email address.", "error");
        if (password !== confirmPassword) return setFeedback("Passwords do not match.", "error");
        if (!updatePasswordStrength().isStrong) return setFeedback("Choose a stronger password before continuing.", "error");
        if (otpRequested && !/^\d{6}$/.test(otp)) return setFeedback("Enter the 6-digit OTP from your email.", "error");

        signupSubmitBtn.disabled = true;
        signupSubmitBtn.textContent = otpRequested ? "Verifying…" : "Sending OTP…";
        try {
            if (!otpRequested) {
                const emailCheck = await readJson(await fetch("/api/auth/check-email", {
                    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email })
                }), "Could not check that email");
                if (emailCheck.registered) {
                    if (emailCheck.pendingVerification) {
                        startOtpVerificationState();
                        startResendCooldown();
                        setFeedback("This signup is waiting for email verification. Enter the OTP or resend it.", "info");
                        return;
                    }
                    throw new Error("That email is already registered. Please log in instead.");
                }
                if (emailCheck.deliverable === false) throw new Error(emailCheck.message || "That email domain cannot receive mail.");
                const data = await readJson(await fetch("/api/auth/register", {
                    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, password })
                }), "Could not start signup");
                startOtpVerificationState();
                startResendCooldown();
                setFeedback(data.message || "OTP sent. Check your email to continue.", "success");
                return;
            }

            const verifyData = await readJson(await fetch("/api/auth/verify-email-otp", {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, otp })
            }), "Could not verify that OTP");
            signupForm.reset();
            resetSignupVerificationState();
            change(1);
            setFeedback(verifyData.message || "Email verified. You can now log in.", "success");
        } catch (error) {
            setFeedback(error.message, "error");
        } finally {
            signupSubmitBtn.disabled = false;
            signupSubmitBtn.textContent = otpRequested ? "Verify OTP" : "Sign Up";
        }
    });

    resendOtpBtn.addEventListener("click", async () => {
        const email = signupEmailInput.value.trim().toLowerCase();
        if (!emailRegex.test(email)) return setFeedback("Please enter a valid email before resending.", "error");
        resendOtpBtn.disabled = true;
        setFeedback("Sending a fresh OTP…", "info");
        try {
            const data = await readJson(await fetch("/api/auth/resend-email-otp", {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email })
            }), "Could not resend OTP");
            startResendCooldown();
            setFeedback(data.message || "OTP resent.", "success");
        } catch (error) {
            resendOtpBtn.disabled = false;
            setFeedback(error.message, "error");
        }
    });
})();
