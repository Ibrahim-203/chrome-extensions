
const creatGroup = document.getElementById('newGroup');
const nameGroupField = document.getElementById('nameGroup');


document.addEventListener('DOMContentLoaded', () => {
    // Fermer le modal
    displayGroups();
});

creatGroup.addEventListener('click', async () => {
    const nameGroup = nameGroupField.value;
    if (nameGroup) {
        await addGroupToLocalStorage(nameGroup);
        displayGroups();
        nameGroupField.value = '';
        alert(`Group "${nameGroup}" created!`);
    } else {
        alert('Please enter a group name.');
    }
});

const addGroupToLocalStorage = (groupName) => {
    return new Promise((resolve) => {
        chrome.storage.local.get(['groups'], (result) => {
            const groups = result.groups || {};
            if (!groups[groupName]) {
                groups[groupName] = [];
                chrome.storage.local.set({ groups }, () => {
                    resolve();
                });
            } else {
                resolve();
            }
        });
    });
};

const handleEditGroup = (groupName) => {
    const groupList = document.getElementById('groupList');
    // Find the row for the group
    const rows = groupList.querySelectorAll('.columns');
    rows.forEach(row => {
        const colName = row.querySelector('.column:not(.is-one-quarter)');
        if (colName && colName.textContent.trim() === groupName) {
            // Replace <p> with <input>
            const input = document.createElement('input');
            input.type = 'text';
            input.value = groupName;
            input.className = 'input is-small';
            colName.innerHTML = '';
            colName.appendChild(input);
            input.focus();

            // Save on blur or Enter
            const saveEdit = () => {
                const newName = input.value.trim();
                if (newName && newName !== groupName) {
                    chrome.storage.local.get(['groups'], (result) => {
                        const groups = result.groups || {};
                        if (!groups[newName]) {
                            groups[newName] = groups[groupName];
                            delete groups[groupName];
                            chrome.storage.local.set({ groups }, () => {
                                displayGroups();
                                alert(`Group renamed to "${newName}"`);
                            });
                        } else {
                            alert('A group with this name already exists.');
                            displayGroups();
                        }
                    });
                } else {
                    displayGroups();
                }
            };

            input.addEventListener('blur', saveEdit);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    input.blur();
                } else if (e.key === 'Escape') {
                    displayGroups();
                }
            });
        }
    });
};

const handleDeleteGroup = (groupName) => {
    if (confirm(`Delete group "${groupName}"?`)) {
        chrome.storage.local.get(['groups'], (result) => {
            const groups = result.groups || {};
            delete groups[groupName];
            chrome.storage.local.set({ groups }, () => {
                displayGroups();
                alert(`Group "${groupName}" deleted!`);
            });
        });
    }
};

const addLinkToGroup = (groupName) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const url = tabs[0].url;
        chrome.storage.local.get(['groups'], (result) => {
            const groups = result.groups || {};
            if (groups[groupName] && !groups[groupName].includes(url)) {
                groups[groupName].push(url);
                console.log(groups);
                chrome.storage.local.set({ groups }, () => {
                    displayGroups();
                    alert(`Link added to group "${groupName}"!`);
                });
            }
        });
    });
};

const handleShowLinks = async (groupName) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.storage.local.get(['groups'], (result) => {
        const groups = result.groups || {};

        console.log(groups);
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["content.js"]
        }, () => {
            chrome.tabs.sendMessage(tab.id, {
                action: "showModal",
                title: groupName,
                links: groups[groupName] || [],
            }).catch((err) => console.warn("Message non reçu :", err));
        });
    });
}

const displayGroups = async () => {
    chrome.storage.local.get(['groups'], (result) => {
        const groups = result.groups || {};
        const groupList = document.getElementById('groupList');
        groupList.innerHTML = '';
        let element = '';
        Object.keys(groups).forEach(groupName => {
            // Crée le conteneur
            const row = document.createElement('div');
            row.className = "columns is-mobile is-vcentered";
            // Colonne nom
            const colName = document.createElement('div');
            const labelGroup = document.createElement('p');
            colName.className = "column";
            labelGroup.className = "is-size-5";
            labelGroup.textContent = groupName;

            colName.innerHTML = labelGroup.outerHTML;
            // Colonne actions
            const colActions = document.createElement('div');
            colActions.className = "column is-one-third";
            // Button show links
            const showLinksBtn = document.createElement('i');
            showLinksBtn.className = "fa-solid fa-eye has-text-primary is-hover";
            showLinksBtn.style.cursor = "pointer";
            showLinksBtn.addEventListener('click', () => handleShowLinks(groupName));
            // Button add link
            const addLinkBtn = document.createElement('i');
            addLinkBtn.className = "fa-solid fa-plus has-text-success is-hover ml-1";
            addLinkBtn.style.cursor = "pointer";
            addLinkBtn.addEventListener('click', () => addLinkToGroup(groupName));
            // Bouton edit
            const editBtn = document.createElement('i');
            editBtn.className = "fa-solid fa-pen has-text-info is-hover ml-1";
            editBtn.style.cursor = "pointer";
            editBtn.addEventListener('click', () => handleEditGroup(groupName));
            // Bouton delete
            const deleteBtn = document.createElement('i');
            deleteBtn.className = "fa-solid fa-trash has-text-danger ml-1";
            deleteBtn.style.cursor = "pointer";
            deleteBtn.addEventListener('click', () => handleDeleteGroup(groupName));
            // Ajoute les boutons
            colActions.appendChild(showLinksBtn);
            colActions.appendChild(addLinkBtn);
            colActions.appendChild(editBtn);
            colActions.appendChild(deleteBtn);
            // Ajoute les colonnes à la ligne
            row.appendChild(colName);
            row.appendChild(colActions);
            // Ajoute la ligne à la liste
            groupList.appendChild(row);
        });
    });
};

// Expose functions to window for inline onclick usage
window.handleEditGroup = handleEditGroup;
window.handleDeleteGroup = handleDeleteGroup;

