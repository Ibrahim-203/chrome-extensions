const checkbox = document.getElementById('colorEnabled');
const saveBtn = document.getElementById('saveBtn');

chrome.storage.sync.get("colorEnabled", (data) => {
    checkbox.checked = data.colorEnabled || false;
});

saveBtn.addEventListener('click', () => {
    const color = document.getElementById("colorPicker").value;
    chrome.storage.sync.set({colorEnabled: checkbox.checked, defaultColor : color}, () => {
        alert('Settings saved!');
    });
})