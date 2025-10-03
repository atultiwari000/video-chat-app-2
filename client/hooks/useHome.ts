import { useCallback, useState } from "react";
import { useRouter } from "next/navigation"; 
import { useSocket } from "../context/Socket";

export const useHome = () => {
  const [userName, setUserName] = useState("");
  const [room, setRoom] = useState("");
  const socket = useSocket();
  const router = useRouter(); 

  const joinPreviewPage = useCallback(() => {
    if (!userName.trim() || !room.trim()) {
      alert("Please enter both username and room code");
      return;
    }

    sessionStorage.setItem("userName", userName);
    sessionStorage.setItem("room", room);

    router.push(
      `/preview?userName=${encodeURIComponent(userName)}&room=${encodeURIComponent(room)}`
    );
  }, [userName, room, router]);

  const handleSubmitForm = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      joinPreviewPage();
    },
    [joinPreviewPage]
  );

  return { userName, setUserName, room, setRoom, socket, joinPreviewPage, handleSubmitForm };

};
