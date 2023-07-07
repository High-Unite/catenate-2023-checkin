import QrScanner from "qr-scanner";
import jsQR from "jsqr";
import "./styles/styles.css";
import { setDefaults, toast } from "bulma-toast";
import {
  curry,
  compose,
  reduce,
  promises,
  trace
} from "./fp";

setDefaults({
  duration: 2000,
  position: "top-right",
  dismissible: true,
  animate: { in: "fadeIn", out: "fadeOut" },
});

const GSAPI_URL =
  "https://script.google.com/macros/s/AKfycbxxupcyQ8Dpv1nMThX-y27PJdP8c_s6hNUEeTTWFr4hK5By9G7L6AI5N_it5FWamkRm/exec";

const scanQueue = {
  _value: null,
  get() {
    this._value =
      this._value || JSON.parse(localStorage.getItem("scanQueue") || "[]");
    return this._value;
  },
  set(val) {
    this._value = val;
    localStorage.setItem("scanQueue", JSON.stringify(val));
    return this; // for chaining
  },
};

function paramsFromObject(params) {
  if (!params) return ""
  return '?' +
  Object.keys(params)
    .map(key => `${key}=${encodeURIComponent(params[key])}`)
    .join('&')
}

async function fetchPeople(method: "GET" | "POST" | string, data?: any, params?: any = {}) {
  return await fetch(GSAPI_URL+paramsFromObject(params), {
    method,
    headers: { "Content-Type": "text/plain" },
    body: data ? JSON.stringify(data) : undefined,
  }).then((res) => res.json());
}

function getQueryVariable(variable, query) {
  query = query || window.location.search.substring(1);
  var vars = query.split("&");
  for (var i = 0; i < vars.length; i++) {
    var pair = vars[i].split("=");
    if (decodeURIComponent(pair[0]) == variable) {
      return decodeURIComponent(pair[1]);
    }
  }
  console.log("Query variable %s not found", variable);
}

// SIDE EFFECTS BEWARE
// Flash animation for when a scan completes
function flashAnimator($el) {
  const flashAnimation = $el.animate(
    [
      {
        opacity: 0,
      },
      {
        opacity: 1,
      },
      {
        opacity: 0,
      },
    ],
    {
      duration: 200,
      iterations: 1,
      fill: "backwards",
    }
  );
  flashAnimation.pause(); // SIDE EFFECT
  return flashAnimation;
}

const withTimeout = curry((duration, promise) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), duration)
    ),
  ])
);

const withNetworkErrorGuard = curry(async function (cb, promise) {
  try {
    return await promise;
  } catch (err) {
    if (["Timeout", "Network request failed"].includes(err.message)) {
      return cb(err);
    }
  }
});

const checkIn = reduce(
  trace(async (prev, curr) =>
    (await compose(
      promises.then((res: { ok: boolean }) => {
        let toastOptions = {
          message: res.message,
          type: res.ok ? "is-success" : "is-danger",
        };
        if (res.error) {
          // Side effects
          switch (res.code) {
            case 1:
              toastOptions = {
                message: res.message,
                duration: 4000,
                type: "is-warning",
              };
              break;
            default:
              toastOptions = {
                message: "An error occurred: " + JSON.stringify(res.message),
                type: "is-danger",
              };
          }
        }
        toast(toastOptions);
        return false;
      }),
      withNetworkErrorGuard(() => {
        toast({
          message: "A network error occurred",
          duration: 4000,
          type: "is-warning",
        });
        return true;
      }),
      fetchPretty
    )(curr))
      ? [...(await prev), curr]
      : prev),
  []
);

async function checkInAndSave(newData, queue) {
  return queue.set(
    await checkIn([
      newData,
      ...queue.get(),
    ])
  );
}

function fetchPretty(data: any, params: any) {
  return withTimeout(10000)(fetchPeople("POST", data, params));
}

function setCookie(cname, cvalue, exdays) {
  const d = new Date();
  d.setTime(d.getTime() + exdays * 24 * 60 * 60 * 1000);
  let expires = "expires=" + d.toUTCString();
  document.cookie = cname + "=" + cvalue + ";" + expires + ";path=/";
}

function getCookie(cname) {
  let name = cname + "=";
  let decodedCookie = decodeURIComponent(document.cookie);
  let ca = decodedCookie.split(";");
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) == " ") {
      c = c.substring(1);
    }
    if (c.indexOf(name) == 0) {
      return c.substring(name.length, c.length);
    }
  }
  return "";
}

window.onload = async function () {
  if (getQueryVariable("name") || getQueryVariable("id")) {
    document.querySelector(".container").innerHTML = "Loading...";

    var pass = getCookie("p") || prompt("What's the password");
    if (btoa(pass) === "aWFtZGF2ZQ==") {
      try {
        setCookie("p", pass, 1);
        toast({
          message: "Processing",
          duration: 2000,
        });
        await checkInAndSave(
          {
            name: getQueryVariable("name"),
            id: getQueryVariable("id"),
          },
          scanQueue
        );
        document.querySelector(".container").innerHTML = "Done";
      } catch (e) {
        document.querySelector(".container").innerHTML = "Error";
      }
    }
  } else {
    // Set up video element for scanning
    const videoElem = document.querySelector("video");
    videoElem.setAttribute("autoplay", "");
    videoElem.setAttribute("muted", "");
    videoElem.setAttribute("playsinline", "");

    // Scan state tracking
    let searching = false;

    // Animate the scan container
    let flashAnimation = flashAnimator(
      document.querySelector(".scan-container .scan-flash")
    );

    function startSearch() {
      // searching = true;
      // videoElem.pause();
      // document
      //   .querySelector(".scan-region-highlight-svg")
      //   .getAnimations()[0]
      //   .pause();
      flashAnimation.play();
    }

    function stopSearch() {
      videoElem.play();
      const $scanHighlight = document.querySelector(
        ".scan-region-highlight-svg"
      );
      $scanHighlight.getAnimations()[0].play();
      $scanHighlight.classList.remove("found");
      // searching = false;
    }

    let scans = {};
    let submits = {};

    const qrScanner = new QrScanner(
      videoElem,
      ({ data }) => {
        const c = scans[data];
        scans[data] = setTimeout(() => delete scans[data], 3000);
        if (c) return clearTimeout(c);
        console.log(data);

        if (!data) return;
        const name = getQueryVariable("name", data.split("?")[1]);
        const id = getQueryVariable("id", data.split("?")[1]);
        if (!name && !id) return;
        startSearch();
        const key = name;
        fetchingPeople.push(key);
        updateQueue();
        checkInAndSave(
          {
            name: name || getQueryVariable("name"),
            id: id || getQueryVariable("id"),
          },
          scanQueue
        ).catch((err) => console.warn(err))
          .finally(() => {
            stopSearch();
            // document.getElementById("submit").disabled = false
            fetchingPeople.shift();
            updateQueue();
          });

        // const n = parseInt(data, 32);
        // const hash = n >> 2,
        //   day = n & 3;
        // if (typeof n !== "number") return;
        // // qrScanner.stop();
        // startSearch();
        // fetchPretty({ hash, day })//.finally(stopSearch);
        console.log(data);
      },
      {
        highlightScanRegion: true,
        highlightCodeOutline: true,
        maxScansPerSecond: 5,
      }
    );
    document.getElementById("startScan").onclick = () => {
      qrScanner.start();
    };
    document.getElementById("stopScan").onclick = () => {
      qrScanner.stop();
    };

    let fetchingPeople = [];

    function updateQueue() {
      const $loadingPeople = document.getElementById("loadingPeople");
      let newIndices = [];
      for (let i = 0; i < fetchingPeople.length; i++) {
        const name = fetchingPeople[i];
        if (!$loadingPeople.querySelector(`li[key="${name}"]`)) {
          const newEl = document.createElement("li");
          newEl.setAttribute("class", "notification");
          newEl.setAttribute("key", name);
          newEl.innerHTML = "Loading: " + name;
          console.log(newEl);
          if (i === 0) $loadingPeople.appendChild(newEl);
          else $loadingPeople.querySelector(`li:nth-child(${i})`).after(newEl);
          newEl.animate([{ opacity: 0 }, { opacity: 1 }], {
            fill: "forwards",
            duration: 500,
          });
        }
      }
      for (let $li of document
        .getElementById("loadingPeople")
        .querySelectorAll("li")) {
        if (!fetchingPeople.includes($li.getAttribute("key"))) {
          const a = $li.animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: 500,
          });
          a.addEventListener("finish", () => {
            $li.parentElement.removeChild($li);
          });
        }
      }
    }

    // auto-complete thing
    fetchPeople("GET").then((people) => {
      const personName = document.querySelector("input#sfPersonName");
      const $dataList = document.createElement("datalist");
      $dataList.setAttribute("id", "persons");

      people.forEach((person: string) => {
        const opt = document.createElement("option");
        opt.value = person;
        $dataList.appendChild(opt);
      });

      const formElem = document.querySelector("form#checkPerson");
      formElem.addEventListener("input", (e) => {
        const check = people.indexOf(personName.value) > -1;
        personName.classList[check ? "remove" : "add"]("is-danger");
        personName.setAttribute("invalid", check);
      });
      formElem.addEventListener("submit", (e) => {
        e.preventDefault();
        const check = people.indexOf(personName.value) > -1;
        if (!check) {
          // alert("Invalid or incomplete name");
          // personName.value = "";
        } else {
          const data = {
            name: personName.value,
          };
          const key = data.name;
          const c = submits[key];
          submits[key] = setTimeout(() => delete submits[key], 3000);
          if (c) {
            toast({ message: `${data.name} has already been checked in` });
            return clearTimeout(c);
          }

          if (!fetchingPeople) {
            personName.parentElement.classList.add("is-loading");
          }
          fetchingPeople.push(key);
          updateQueue();
          personName.value = "";
          // personName.disabled = true;
          // document.getElementById("submit").disabled = true;
          checkInAndSave(data, scanQueue).then(() => {
            // personName.disabled = false
            // document.getElementById("submit").disabled = false
            fetchingPeople.shift();
            updateQueue();
            if (fetchingPeople.length === 0) {
              personName.parentElement.classList.remove("is-loading");
            }
          });
        }
      });
      
      document.getElementById("checkout").addEventListener("click", (e) => {
        e.preventDefault();
        const check = people.indexOf(personName.value) > -1;
        if (!check) {
          // alert("Invalid or incomplete name");
          // personName.value = "";
        } else {
          const data = {
            name: personName.value,
          };
          const key = data.name;
          const c = submits[key];
          submits[key] = setTimeout(() => delete submits[key], 3000);
          if (c) {
            toast({ message: `${data.name} has already been checked in` });
            return clearTimeout(c);
          }

          if (!fetchingPeople) {
            personName.parentElement.classList.add("is-loading");
          }
          fetchingPeople.push(key);
          updateQueue();
          personName.value = "";
          // personName.disabled = true;
          // document.getElementById("submit").disabled = true;
          fetchPretty(data, {action: "uncheck"}).then((res) => {
            toast({
              message: JSON.stringify(res),
              type: res.ok ? "is-success" : "is-danger"
            })
            // personName.disabled = false
            // document.getElementById("submit").disabled = false
            fetchingPeople.shift();
            updateQueue();
            if (fetchingPeople.length === 0) {
              personName.parentElement.classList.remove("is-loading");
            }
          })
        }
      });

      personName.append($dataList);
    });
  }
};
