const $ = (id) => document.getElementById(id);
const mode = $("mode");
const step = $("step");
const clock = $("clock");
const hourHand = $("hour-hand");
const minuteHand = $("minute-hand");
const feedback = $("feedback");
const checkButton = $("check");
const nextButton = $("next");
let number = 1;
let score = 0;
let target = { hour: 1, minute: 0 };
let chosen = { hour: 12, minute: 0 };
let selectedHand = "minute";
let checked = false;
let finished = false;

for (let i = 0; i < 60; i++) {
  const tick = document.createElement("i");
  tick.className = `tick${i % 5 === 0 ? " major" : ""}`;
  tick.style.transform = `rotate(${i * 6}deg)`;
  $("ticks").append(tick);
}
for (let i = 1; i <= 12; i++) {
  const angle = i * Math.PI / 6;
  const numeral = document.createElement("span");
  numeral.className = "number";
  numeral.style.left = `${50 + Math.sin(angle) * 34}%`;
  numeral.style.top = `${50 - Math.cos(angle) * 34}%`;
  numeral.textContent = i;
  $("numbers").append(numeral);
}

const two = (value) => String(value).padStart(2, "0");
const timeText = (time) => `${time.hour}:${two(time.minute)}`;
const wrapHour = (hour) => ((hour - 1 + 120) % 12) + 1;
const minuteStep = () => Number(step.value);

function drawClock() {
  const value = mode.value === "read" ? target : chosen;
  hourHand.style.transform = `rotate(${(value.hour % 12) * 30 + value.minute * .5}deg)`;
  minuteHand.style.transform = `rotate(${value.minute * 6}deg)`;
  $("chosen-time").textContent = timeText(chosen);
}

function render() {
  $("progress").textContent = finished ? `完成 · ${score}/10` : `${number} / 10`;
  $("question-label").textContent = finished ? "练习完成" : `第 ${number} 题`;
  $("prompt").textContent = finished ? `答对 ${score} 道题！` : mode.value === "read" ? "这个钟面是几点？" : `请把时钟拨到 ${timeText(target)}`;
  $("read-controls").hidden = mode.value !== "read" || finished;
  $("set-controls").hidden = mode.value !== "set" || finished;
  clock.classList.toggle("is-interactive", mode.value === "set" && !checked && !finished);
  $("clock-note").textContent = mode.value === "read" ? "读出钟面上的时间" : "选择指针后点击或拖动钟面";
  $("select-hour").classList.toggle("active", selectedHand === "hour");
  $("select-minute").classList.toggle("active", selectedHand === "minute");
  checkButton.hidden = checked || finished;
  nextButton.hidden = !checked && !finished;
  nextButton.textContent = finished ? "再练一次" : number === 10 ? "查看结果" : "下一题";
  drawClock();
}

function makeQuestion() {
  target = { hour: 1 + Math.floor(Math.random() * 12), minute: Math.floor(Math.random() * (60 / minuteStep())) * minuteStep() };
  chosen = { hour: 12, minute: 0 };
  checked = false;
  feedback.textContent = "";
  feedback.classList.remove("wrong");
  $("answer-hour").value = "";
  $("answer-minute").value = "";
  render();
}

function reset() {
  number = 1;
  score = 0;
  finished = false;
  makeQuestion();
}

function setFromPointer(event) {
  if (mode.value !== "set" || checked || finished) return;
  const rect = clock.getBoundingClientRect();
  const x = event.clientX - rect.left - rect.width / 2;
  const y = event.clientY - rect.top - rect.height / 2;
  const degrees = (Math.atan2(x, -y) * 180 / Math.PI + 360) % 360;
  if (selectedHand === "hour") chosen.hour = wrapHour(Math.round(degrees / 30));
  else chosen.minute = (Math.round(degrees / (6 * minuteStep())) * minuteStep()) % 60;
  drawClock();
}

let dragging = false;
clock.addEventListener("pointerdown", (event) => {
  if (mode.value !== "set" || checked || finished) return;
  dragging = true;
  clock.setPointerCapture(event.pointerId);
  setFromPointer(event);
});
clock.addEventListener("pointermove", (event) => { if (dragging) setFromPointer(event); });
clock.addEventListener("pointerup", () => { dragging = false; });
clock.addEventListener("pointercancel", () => { dragging = false; });

$("select-hour").addEventListener("click", () => { selectedHand = "hour"; render(); });
$("select-minute").addEventListener("click", () => { selectedHand = "minute"; render(); });
function adjust(direction) {
  if (checked || finished) return;
  if (selectedHand === "hour") chosen.hour = wrapHour(chosen.hour + direction);
  else chosen.minute = (chosen.minute + direction * minuteStep() + 60) % 60;
  drawClock();
}
$("decrease").addEventListener("click", () => adjust(-1));
$("increase").addEventListener("click", () => adjust(1));

checkButton.addEventListener("click", () => {
  const answer = mode.value === "read"
    ? { hour: Number($("answer-hour").value), minute: Number($("answer-minute").value) }
    : chosen;
  if (mode.value === "read" && (!$("answer-hour").value || !$("answer-minute").value || answer.hour < 1 || answer.hour > 12 || answer.minute < 0 || answer.minute > 59)) {
    feedback.textContent = "请先填写完整时间";
    feedback.classList.add("wrong");
    return;
  }
  const correct = answer.hour === target.hour && answer.minute === target.minute;
  if (correct) score++;
  feedback.textContent = correct ? "答对了！" : `这题的答案是 ${timeText(target)}`;
  feedback.classList.toggle("wrong", !correct);
  checked = true;
  render();
});

nextButton.addEventListener("click", () => {
  if (finished) return reset();
  if (number === 10) {
    finished = true;
    feedback.textContent = "再练一次，继续熟悉钟面。";
    feedback.classList.remove("wrong");
    render();
    return;
  }
  number++;
  makeQuestion();
});
mode.addEventListener("change", reset);
step.addEventListener("change", reset);
reset();
