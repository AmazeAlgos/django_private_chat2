import React, {Component} from 'react';
import 'react-chat-elements/dist/main.css';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';
import {ToastContainer, toast} from 'react-toastify';
import {
    MessageBox,
    ChatItem,
    ChatList,
    SystemMessage,
    MessageList,
    Input,
    Button,
    Avatar,
    Navbar,
    SideBar,
    Dropdown,
    Popup,
} from 'react-chat-elements';
import throttle from 'lodash.throttle';
import {FaSearch, FaComments, FaWindowClose, FaEdit, FaSquare, FaTimesCircle} from 'react-icons/fa';
import {MdMenu} from 'react-icons/md';
import ReconnectingWebSocket from 'reconnecting-websocket';
import {
    createNewDialogModelFromIncomingMessageBox,
    getSubtitleTextFromMessageBox,
    fetchSelfInfo,
    handleIncomingWebsocketMessage,
    sendOutgoingTextMessage,
    filterMessagesForDialog,
    fetchDialogs,
    fetchMessages,
    fetchUsersList,
    sendIsTypingMessage,
} from "../fs-src/App.fs.js"

import {
    format,
} from 'timeago.js';

import loremIpsum from 'lorem-ipsum';

const TYPING_TIMEOUT = 5000;
const chatItemSortingFunction = (a,b) => b.date - a.date;
export class App extends Component {

    constructor(props) {
        super(props);
        // Refs
        this.textInput = null;
        this.setTextInputRef = element => {
            this.textInput = element;
        };
        this.clearTextInput = () => {
            if (this.textInput) this.textInput.clear();
        };

        this.searchInput = null;
        this.setSearchInputRef = element => {
            this.searchInput = element;
        };
        this.clearSearchInput = () => {
            if (this.searchInput) this.searchInput.clear();
        };


        this.state = {
            socketConnectionState: 0,
            showNewChatPopup: false,
            newChatChosen: null,
            usersDataLoading: false,
            availableUsers: [],
            messageList: [],
            dialogList: [],
            filteredDialogList: [],
            typingPKs: [],
            onlinePKs: [],
            selfInfo: null,
            selectedDialog: null,
            socket: new ReconnectingWebSocket('ws://' + window.location.host + '/chat_ws')
        };
        //some js magic
        this.performSendingMessage = this.performSendingMessage.bind(this);
        this.addMessage = this.addMessage.bind(this);
        this.replaceMessageId = this.replaceMessageId.bind(this);
        this.addPKToTyping = this.addPKToTyping.bind(this);
        this.changePKOnlineStatus = this.changePKOnlineStatus.bind(this);

        this.isTyping = throttle(() => {
            sendIsTypingMessage(this.state.socket)
        }, TYPING_TIMEOUT)

        this.localSearch = throttle(() => {
            let val = this.searchInput.input.value;
            console.log("localSearch with '" + val + "'")
            if (!val || 0 === val.length) {
                this.setState(prevState => ({filteredDialogList: prevState.dialogList}));
            } else {
                this.setState(prevState => ({
                    filteredDialogList: prevState.dialogList.filter(function (el) {
                        return el.title.toLowerCase().includes(val.toLowerCase())
                    })
                }))
            }
        }, 100)
    }

    componentDidMount() {
        fetchMessages().then((r) => {
            if (r.tag === 0) {
                console.log("Fetched messages:")
                console.log(r.fields[0])
                this.setState({messageList: r.fields[0]})
            } else {
                console.log("Messages error:")
                toast.error(r.fields[0])
            }
        })

        fetchDialogs().then((r) => {
            if (r.tag === 0) {
                console.log("Fetched dialogs:")
                console.log(r.fields[0])
                this.setState({dialogList: r.fields[0], filteredDialogList: r.fields[0]})
                this.selectDialog(r.fields[0][0])
            } else {
                console.log("Dialogs error:")
                toast.error(r.fields[0])
            }
        })
        fetchSelfInfo().then((r) => {
            if (r.tag === 0) {
                console.log("Fetched selfInfo:")
                console.log(r.fields[0])
                this.setState({selfInfo: r.fields[0]})
            } else {
                console.log("SelfInfo error:")
                toast.error(r.fields[0])
            }
        })
        this.setState({socketConnectionState: this.state.socket.readyState});
        const that = this;
        let socket = this.state.socket;
        let toastOptions = {
            autoClose: 1500,
            hideProgressBar: true,
            closeOnClick: false,
            pauseOnHover: false,
            pauseOnFocusLoss: false,
            draggable: false,
        };

        socket.onopen = function (e) {
            toast.success("Connected!", toastOptions)
            that.setState({socketConnectionState: socket.readyState});
        }
        socket.onmessage = function (e) {
            that.setState({socketConnectionState: socket.readyState});

            let errMsg = handleIncomingWebsocketMessage(socket, e.data, {
                addMessage: that.addMessage,
                replaceMessageId: that.replaceMessageId,
                addPKToTyping: that.addPKToTyping,
                changePKOnlineStatus: that.changePKOnlineStatus
            });
            if (errMsg) {
                toast.error(errMsg)
            }
        };
        socket.onclose = function (e) {
            toast.info("Disconnected...", toastOptions)
            that.setState({socketConnectionState: socket.readyState});
            console.log("websocket closed")
        }
    }

    selectDialog(item) {
        this.setState({selectedDialog: item})
        this.setState(prevState => ({
            dialogList: prevState.dialogList.map(el => (el.id === item.id ?
                {...el, statusColorType: 'encircle'} : {...el, statusColorType: undefined}))
        }))
        this.setState(prevState => ({filteredDialogList: prevState.dialogList}));
    }

    getSocketState() {
        if (this.state.socket.readyState === 0) {
            return "Connecting..."
        } else if (this.state.socket.readyState === 1) {
            return "Connected"
        } else if (this.state.socket.readyState === 2) {
            return "Disconnecting..."
        } else if (this.state.socket.readyState === 3) {
            return "Disconnected"
        }
    }

    addPKToTyping(pk) {
        console.log("Adding " + pk + " to typing pk-s")
        let l = this.state.typingPKs;
        l.push(pk);
        this.setState({typingPKs: l})
        const that = this;
        setTimeout(() => {
            // We can't use 'l' here because it might have been changed in the meantime
            console.log("Will remove " + pk + " from typing pk-s")
            let ll = that.state.typingPKs;
            const index = ll.indexOf(pk);
            if (index > -1) {
                ll.splice(index, 1);
            }
            that.setState({typingPKs: ll})
        }, TYPING_TIMEOUT);
    }

    changePKOnlineStatus(pk, onoff) {
        console.log("Setting " + pk + " to " + onoff ? "online" : "offline" + " status")
        let onlines = this.state.onlinePKs;
        if (onoff) {
            onlines.push(pk)
        } else {
            const index = onlines.indexOf(pk);
            if (index > -1) {
                onlines.splice(index, 1);
            }
        }
        this.setState({onlinePKs: onlines})
        this.setState(prevState => ({
            dialogList: prevState.dialogList.map(function (el) {
                if (el.id === pk) {
                    if (onoff) {
                        return {...el, statusColor: 'lightgreen'};
                    } else {
                        return {...el, statusColor: ''};
                    }
                } else {
                    return el;
                }
            })
        }))
        this.setState(prevState => ({filteredDialogList: prevState.dialogList}));
    }

    addMessage(msg) {
        console.log("Calling addMessage for ")
        console.log(msg)
        let list = this.state.messageList;
        list.push(msg);
        this.setState({
            messageList: list,
        });
        let doesntNeedLastMessageSet = false;
        if (!msg.data.out) {
            let dialogs = this.state.dialogList;
            // TODO: new dialog - test
            let hasDialogAlready = dialogs.some((e) => e.id === msg.data.dialog_id);
            if (!hasDialogAlready) {
                let d = createNewDialogModelFromIncomingMessageBox(msg)
                dialogs.push(d);
                doesntNeedLastMessageSet = true;
                this.setState({
                    dialogList: dialogs,
                });
            }
        }
        if (!doesntNeedLastMessageSet) {
            this.setState(prevState => ({
                dialogList: prevState.dialogList.map(function (el) {
                    if (el.id === msg.data.dialog_id) {
                        console.log("Setting dialog " + msg.data.dialog_id + " last message");
                        return {...el, subtitle: getSubtitleTextFromMessageBox(msg)};
                    } else {
                        return el;
                    }
                })
            }));
        }

        this.setState(prevState => ({filteredDialogList: prevState.dialogList}));
    }

    replaceMessageId(old_id, new_id) {
        console.log("Replacing random id  " + old_id + " with db_id " + new_id)
        this.setState(prevState => ({
            messageList: prevState.messageList.map(function (el) {
                if (el.data.message_id.Equals(old_id)) {
                    let new_status = el.data.out ? 'sent' : 'received'
                    return {...el, data: {dialog_id: el.data.dialog_id, message_id: new_id}, status: new_status}
                } else {
                    return el
                }
            })
        }))
        console.log(this.state)
    }

    performSendingMessage() {
        if (this.state.selectedDialog) {
            let text = this.textInput.input.value;
            let user_pk = this.state.selectedDialog.id;
            this.clearTextInput();
            let msgBox = sendOutgoingTextMessage(this.state.socket, text, user_pk, this.state.selfInfo);
            console.log("sendOutgoingTextMessage result:")
            console.log(msgBox)
            if (msgBox) {
                this.addMessage(msgBox);
            }
        }
    }

    render() {
        return (
            <div className='container'>
                <div
                    className='chat-list'>
                    <SideBar
                        type='light'
                        top={
                            <span className='chat-list'>
                                <Input
                                    placeholder="Search..."
                                    ref={this.setSearchInputRef}
                                    onKeyPress={(e) => {
                                        if (e.charCode !== 13) {
                                            this.localSearch();
                                        }
                                        if (e.charCode === 13) {
                                            this.localSearch();
                                            console.log("search invoke with" + this.searchInput.input.value)
                                            e.preventDefault();
                                            return false;
                                        }
                                    }}
                                    rightButtons={
                                        <div>
                                            <Button
                                                type='transparent'
                                                color='black'
                                                onClick={() => {
                                                    this.localSearch();
                                                    console.log("search invoke with" + this.searchInput.input.value);
                                                }}
                                                icon={{
                                                    component: <FaSearch/>,
                                                    size: 18
                                                }}/>
                                            <Button
                                                type='transparent'
                                                color='black'
                                                icon={{
                                                    component: <FaTimesCircle/>,
                                                    size: 18
                                                }}
                                                onClick={() => this.clearSearchInput()}/>
                                        </div>
                                    }
                                />

                                <ChatList onClick={(item, i, e) => this.selectDialog(item)}
                                          dataSource={this.state.filteredDialogList.slice().sort(chatItemSortingFunction)}/>
                            </span>

                        }
                        bottom={
                            <Button type='transparent' color='black' disabled={true}
                                    text={"Connection state: " + this.getSocketState()}/>
                        }/>
                </div>
                <div
                    className='right-panel'>
                    <ToastContainer/>
                    <Popup
                        show={this.state.showNewChatPopup}
                        header='New chat'
                        headerButtons={[{
                            type: 'transparent',
                            color: 'black',
                            text: 'close',
                            icon: {
                                component: <FaWindowClose/>,
                                size: 18
                            },
                            onClick: () => {
                                this.setState({showNewChatPopup: false})
                            }
                        }]}
                        renderContent={() => {
                            if (this.state.usersDataLoading) {
                                return <div><p>Loading data...</p></div>
                            } else {
                                if (this.state.availableUsers.length === 0) {
                                    return <div><p>No users available</p></div>
                                } else {
                                    return <ChatList onClick={(item, i, e) => {
                                        this.setState({showNewChatPopup: false});
                                        this.selectDialog(item);
                                    }} dataSource={this.state.availableUsers}/>
                                }

                            }
                        }}
                        // footerButtons={[{
                        //     color: 'white',
                        //     backgroundColor: 'lightgreen',
                        //     text: "Hello!",
                        //     disabled: this.state.newChatChosen !== null
                        // }]}

                    />
                    <Navbar left={
                        <ChatItem  {...this.state.selectedDialog} date={null} unread={0}
                                   statusColor={
                                       this.state.selectedDialog && this.state.onlinePKs.includes(this.state.selectedDialog.id) ? "lightgreen" : ""
                                   }
                                   subtitle={
                                       this.state.selectedDialog && this.state.typingPKs.includes(this.state.selectedDialog.id) ? "typing..." : ""
                                   }
                        />
                    } right={
                        <Button
                            type='transparent'
                            color='black'
                            onClick={() => {
                                this.setState({usersDataLoading: true})
                                fetchUsersList(this.state.dialogList).then((r) => {
                                    this.setState({usersDataLoading: false})
                                    if (r.tag === 0) {
                                        console.log("Fetched users:")
                                        console.log(r.fields[0])
                                        this.setState({availableUsers: r.fields[0]})
                                    } else {
                                        console.log("Users error:")
                                        toast.error(r.fields[0])
                                    }
                                })
                                this.setState({showNewChatPopup: true})
                            }}
                            icon={{
                                component: <FaEdit/>,
                                size: 24
                            }}/>
                    }/>


                    <MessageList
                        className='message-list'
                        lockable={true}
                        downButtonBadge={10}
                        dataSource={filterMessagesForDialog(this.state.selectedDialog, this.state.messageList)}/>

                    <Input
                        placeholder="Type here to send a message."
                        defaultValue=""
                        ref={this.setTextInputRef}
                        multiline={true}
                        // buttonsFloat='left'
                        onKeyPress={(e) => {
                            if (e.charCode !== 13) {
                                console.log('key pressed');

                                this.isTyping();
                            }
                            if (e.shiftKey && e.charCode === 13) {
                                return true;
                            }
                            if (e.charCode === 13) {
                                this.performSendingMessage()
                                e.preventDefault();
                                return false;
                            }
                        }}
                        rightButtons={
                            <Button
                                text='Send'
                                onClick={() => this.performSendingMessage()}/>
                        }/>
                </div>
            </div>
        );
    }
}

export default App;
